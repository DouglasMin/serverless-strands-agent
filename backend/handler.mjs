// handler.mjs — Lambda Function URL (RESPONSE_STREAM) entry point.
//
// Every route requires a Cognito ID token in `Authorization: Bearer <jwt>`.
// The caller's identity is taken from the verified `sub` claim only.
//
// Routes:
//   POST /api/chat             — stream agent response (SSE)
//   POST /api/upload/presign   — generate pre-signed S3 upload URL
//   GET  /api/sessions         — list the caller's sessions
//   GET  /api/sessions/:id     — load one session's messages
//   POST /api/auth/complete    — finish an AgentCore Identity 3LO handshake

import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand
} from "@aws-sdk/client-bedrock-agentcore";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { randomUUID } from "node:crypto";

const REGION = process.env.AWS_REGION_NAME;
const AGENT_RUNTIME_ARN = process.env.AGENT_RUNTIME_ARN;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;
const USER_INDEX = process.env.SESSIONS_USER_INDEX ?? "byUser";
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const TITLE_MAX = 80;
const SESSION_LIST_LIMIT = 100;

const agent = new BedrockAgentCoreClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

// ID token rather than access token: the only thing this API needs from the
// caller is *who they are*, and `sub` is the identity assertion. Created at
// module scope so the JWKS fetch is cached across warm invocations.
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: COGNITO_CLIENT_ID
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const nowEpoch = () => Math.floor(Date.now() / 1000);

const sseFrame = (event, data) => {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
};

const writeJson = (responseStream, body) => {
  responseStream.write(JSON.stringify(body));
  responseStream.end();
};

const writeSseError = (responseStream, message) => {
  responseStream.write(sseFrame("error", { message }));
  responseStream.end();
};

// Resolves the caller to a verified Cognito `sub`. Everything downstream keys
// off this value — sessions, DynamoDB ownership, and AgentCore Identity's 3LO
// token vault — so it must never fall back to a client-supplied string.
async function authenticate(event) {
  const headers = event?.headers ?? {};
  const raw = headers.authorization ?? headers.Authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!match) return { error: "missing bearer token" };

  try {
    const claims = await jwtVerifier.verify(match[1]);
    return { userId: claims.sub };
  } catch (err) {
    return { error: `invalid token: ${err?.message ?? err}` };
  }
}

const respondStatus = (responseStream, statusCode, body) => {
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers: { "content-type": "application/json" }
  });
  stream.write(JSON.stringify(body));
  stream.end();
};

const parseBody = (event) => {
  const raw = event?.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf-8")
    : (event?.body ?? "{}");
  return JSON.parse(raw);
};

const optionalFiniteNumber = (value) => {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseUserLocation = (value) => {
  if (!value || typeof value !== "object") return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const location = { lat, lng };
  const accuracy = optionalFiniteNumber(value.accuracy);
  const capturedAt = optionalFiniteNumber(value.capturedAt);
  if (accuracy !== undefined) location.accuracy = accuracy;
  if (capturedAt !== undefined) location.capturedAt = capturedAt;
  return location;
};

// ─────────────────────────────────────────────────────────────
// DynamoDB Persistence
// ─────────────────────────────────────────────────────────────

async function appendMessage(sessionId, userId, role, content, extra = {}) {
  const t = nowEpoch();
  const message = { role, content, ts: t };
  if (Array.isArray(extra.routePreviews) && extra.routePreviews.length > 0) {
    message.routePreviews = extra.routePreviews;
  }
  if (Array.isArray(extra.documents) && extra.documents.length > 0) {
    message.documents = extra.documents;
  }
  if (extra.trace) {
    message.trace = extra.trace;
  }

  const expr = [
    "messages = list_append(if_not_exists(messages, :empty), :msg)",
    "updatedAt = :now",
    "createdAt = if_not_exists(createdAt, :now)",
    "userId = if_not_exists(userId, :uid)",
    "#ttl = if_not_exists(#ttl, :ttl)"
  ];
  const names = { "#ttl": "ttl" };
  const values = {
    ":empty": [],
    ":msg": [message],
    ":now": t,
    ":uid": userId,
    ":ttl": t + TTL_DAYS * 86400
  };

  // Title is set once on the first user message, truncated.
  if (role === "user") {
    expr.push("#title = if_not_exists(#title, :title)");
    names["#title"] = "title";
    values[":title"] = content.slice(0, TITLE_MAX);
  }

  await ddb.send(
    new UpdateCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
      UpdateExpression: "SET " + expr.join(", "),
      ConditionExpression: "attribute_not_exists(userId) OR userId = :uid",
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    })
  );
}

// ─────────────────────────────────────────────────────────────
// POST /api/upload/presign — generate pre-signed S3 upload URL
// ─────────────────────────────────────────────────────────────

async function handlePresignUpload(event, responseStream, userId) {
  if (!UPLOADS_BUCKET) {
    respondStatus(responseStream, 500, { error: "UPLOADS_BUCKET is not configured" });
    return;
  }

  let body;
  try {
    body = parseBody(event);
  } catch {
    respondStatus(responseStream, 400, { error: "invalid json body" });
    return;
  }

  const filename = (body.filename || "upload.dat").replace(/[^a-zA-Z0-9._-]/g, "_");
  const contentType = body.contentType || "application/octet-stream";
  const sessionId = (body.sessionId || "global").replace(/[^a-zA-Z0-9_-]/g, "_");

  // Multi-tenant key structure: uploads/{userId}/{sessionId}/{uuid}/{filename}
  const key = `uploads/${userId}/${sessionId}/${Date.now()}-${randomUUID().slice(0, 8)}/${filename}`;

  try {
    const command = new PutObjectCommand({
      Bucket: UPLOADS_BUCKET,
      Key: key,
      ContentType: contentType,
      Metadata: {
        userId,
        sessionId,
        originalFilename: filename
      }
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 mins
    const s3Uri = `s3://${UPLOADS_BUCKET}/${key}`;

    respondStatus(responseStream, 200, {
      uploadUrl,
      s3Uri,
      key,
      filename,
      contentType,
      userId
    });
  } catch (err) {
    respondStatus(responseStream, 500, { error: `failed to create presigned url: ${err?.message ?? err}` });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/chat — stream agent response as SSE
// ─────────────────────────────────────────────────────────────

async function handleChat(event, responseStream, userId) {
  const writeFrame = (name, data) => responseStream.write(sseFrame(name, data));

  let body;
  try {
    body = parseBody(event);
  } catch {
    writeSseError(responseStream, "Body must be valid JSON");
    return;
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    writeSseError(responseStream, "prompt is required");
    return;
  }

  const sessionId = body.sessionId ?? randomUUID();
  const userLocation = parseUserLocation(body.userLocation);
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  writeFrame("session", { sessionId });

  try {
    await appendMessage(sessionId, userId, "user", prompt);
  } catch (err) {
    if (err?.name === "ConditionalCheckFailedException") {
      writeSseError(responseStream, "session not found");
      return;
    }
    writeSseError(responseStream, `DDB write failed: ${err?.message ?? err}`);
    return;
  }

  const turnStartTime = Date.now();
  let assistantText = "";
  const routePreviews = [];
  const documents = [];
  const toolsUsed = [];
  let assistantPersisted = false;

  const saveAssistantMessage = async () => {
    if (assistantPersisted) return null;
    assistantPersisted = true;
    const durationMs = Date.now() - turnStartTime;
    const traceInfo = {
      sessionId,
      durationMs,
      model: "claude-3.7-sonnet",
      toolsUsed,
      timestamp: nowEpoch(),
      memoryEnabled: !userLocation,
      langfuseTraceId: sessionId
    };

    try {
      const hasContent = assistantText.trim().length > 0;
      const hasArtifacts = routePreviews.length > 0 || documents.length > 0;
      if (hasContent || hasArtifacts) {
        await appendMessage(
          sessionId,
          userId,
          "assistant",
          assistantText,
          { routePreviews, documents, trace: traceInfo }
        );
      }
    } catch (err) {
      console.error("Failed to append assistant message to DynamoDB:", err);
    }
    return traceInfo;
  };

  const pingTimer = setInterval(() => {
    try {
      responseStream.write(": keep-alive\n\n");
    } catch {
      // stream closed
    }
  }, 5000);

  try {
    const enrichedAttachments = [];
    for (const att of attachments) {
      if (att && att.key && UPLOADS_BUCKET) {
        try {
          const getCmd = new GetObjectCommand({
            Bucket: UPLOADS_BUCKET,
            Key: att.key
          });
          const downloadUrl = await getSignedUrl(s3, getCmd, { expiresIn: 3600 });
          enrichedAttachments.push({ ...att, downloadUrl });
        } catch (err) {
          console.warn("Failed to presign downloadUrl:", err);
          enrichedAttachments.push(att);
        }
      } else {
        enrichedAttachments.push(att);
      }
    }

    const payload = {
      prompt,
      userId,
      ...(userLocation ? { userLocation } : {}),
      ...(enrichedAttachments.length ? { attachments: enrichedAttachments } : {})
    };

    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: AGENT_RUNTIME_ARN,
      runtimeSessionId: sessionId,
      runtimeUserId: userId,
      qualifier: "DEFAULT",
      payload: new TextEncoder().encode(JSON.stringify(payload))
    });
    command.middlewareStack.add(
      (next) => async (args) => {
        args.request.headers["x-amzn-bedrock-agentcore-runtime-user-id"] = userId;
        args.request.headers["x-amzn-bedrock-agentcore-user-id"] = userId;
        return next(args);
      },
      { step: "build", name: "InjectAgentCoreUserId" }
    );

    const resp = await agent.send(command);

    const decoder = new TextDecoder();
    let buffer = "";

    const parseUiEvent = (obj) => {
      if (!obj || typeof obj !== "object") return null;
      if (obj.type === "tool_use" && obj.name) return { type: "tool_use", data: { name: obj.name } };
      if (obj.type === "auth_url" && obj.url) return { type: "auth_url", data: { url: obj.url } };
      if (obj.type === "route_preview" && obj.preview) return { type: "route_preview", data: obj.preview };
      if (obj.type === "document_artifact" && obj.document) return { type: "document_artifact", data: obj.document };
      if (obj.type === "subagent_event" && obj.subagent) return { type: "subagent_event", data: obj.subagent };
      if (obj.__tool_use__) return { type: "tool_use", data: { name: obj.__tool_use__ } };
      if (obj.__auth_url__) return { type: "auth_url", data: { url: obj.__auth_url__ } };
      if (obj.__route_preview__) return { type: "route_preview", data: obj.__route_preview__ };
      if (obj.__document_artifact__) return { type: "document_artifact", data: obj.__document_artifact__ };
      if (obj.__subagent_event__) return { type: "subagent_event", data: obj.__subagent_event__ };
      return null;
    };

    const flushFrame = (frame) => {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let text;
        try {
          const outer = JSON.parse(raw);
          let uiEvent = parseUiEvent(outer);

          if (!uiEvent && typeof outer === "string") {
            try {
              const inner = JSON.parse(outer);
              uiEvent = parseUiEvent(inner);
            } catch {
              // plain string text
            }
          }

          if (uiEvent) {
            if (uiEvent.type === "tool_use") {
              const tname = String(uiEvent.data?.name || "");
              if (tname && !toolsUsed.includes(tname)) {
                toolsUsed.push(tname);
              }
              writeFrame("tool_use", uiEvent.data);
              continue;
            }
            if (uiEvent.type === "auth_url") {
              writeFrame("auth_url", uiEvent.data);
              continue;
            }
            if (uiEvent.type === "route_preview") {
              routePreviews.push(uiEvent.data);
              writeFrame("route_preview", uiEvent.data);
              continue;
            }
            if (uiEvent.type === "document_artifact") {
              documents.push(uiEvent.data);
              writeFrame("document_artifact", uiEvent.data);
              continue;
            }
            if (uiEvent.type === "subagent_event") {
              writeFrame("subagent_event", uiEvent.data);
              continue;
            }
          }

          text = typeof outer === "string" ? outer : JSON.stringify(outer);
        } catch {
          text = raw;
        }
        if (!text) continue;
        assistantText += text;
        writeFrame("delta", { text });
      }
    };

    for await (const chunk of resp.response) {
      buffer += decoder.decode(chunk, { stream: true });
      let sepIdx;
      while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
        flushFrame(buffer.slice(0, sepIdx));
        buffer = buffer.slice(sepIdx + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) flushFrame(buffer);

    const traceInfo = await saveAssistantMessage();
    if (traceInfo) {
      writeFrame("trace", traceInfo);
    }
    writeFrame("done", { sessionId });
  } catch (err) {
    console.error("Agent runtime stream error:", err);
    await saveAssistantMessage();
    try {
      writeSseError(responseStream, `Agent runtime error: ${err?.message ?? err}`);
    } catch {
      // response stream may already be closed
    }
  } finally {
    clearInterval(pingTimer);
    await saveAssistantMessage();
    try {
      responseStream.end();
    } catch {
      // ignore
    }
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/sessions — list recent sessions for caller
// ─────────────────────────────────────────────────────────────

async function handleListSessions(_event, responseStream, userId) {
  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: SESSIONS_TABLE,
        IndexName: USER_INDEX,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        ScanIndexForward: false,
        Limit: SESSION_LIST_LIMIT,
        ProjectionExpression: "sessionId, title, createdAt, updatedAt, pinned"
      })
    );

    const sessions = (result.Items ?? []).map((item) => ({
      sessionId: item.sessionId,
      title: item.title ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      pinned: Boolean(item.pinned)
    }));

    writeJson(responseStream, { sessions });
  } catch (err) {
    writeJson(responseStream, { error: `query failed: ${err?.message ?? err}` });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/sessions/:id — fetch single session messages
// ─────────────────────────────────────────────────────────────

async function handleGetSession(_event, responseStream, sessionId, userId) {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionId }
      })
    );

    const item = result.Item;
    if (!item) {
      respondStatus(responseStream, 404, { error: "session not found" });
      return;
    }

    if (item.userId && item.userId !== userId) {
      respondStatus(responseStream, 404, { error: "session not found" });
      return;
    }

    writeJson(responseStream, {
      sessionId: item.sessionId,
      title: item.title ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      pinned: Boolean(item.pinned),
      messages: item.messages ?? []
    });
  } catch (err) {
    writeJson(responseStream, { error: `get failed: ${err?.message ?? err}` });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/sessions/:id — delete a session
// ─────────────────────────────────────────────────────────────

async function handleDeleteSession(_event, responseStream, sessionId, userId) {
  try {
    console.log(`[DELETE_SESSION] sessionId=${sessionId} userId=${userId}`);
    await ddb.send(
      new DeleteCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionId },
        ConditionExpression: "userId = :uid OR attribute_not_exists(userId)",
        ExpressionAttributeValues: { ":uid": userId }
      })
    );
    writeJson(responseStream, { success: true, sessionId });
  } catch (err) {
    console.error(`[DELETE_SESSION_ERROR] sessionId=${sessionId}:`, err);
    if (err?.name === "ConditionalCheckFailedException") {
      writeJson(responseStream, { error: "session not found" });
      return;
    }
    writeJson(responseStream, { error: `delete failed: ${err?.message ?? err}` });
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/sessions/:id — rename or pin a session
// ─────────────────────────────────────────────────────────────

async function handleUpdateSession(event, responseStream, sessionId, userId) {
  let body;
  try {
    body = parseBody(event);
  } catch {
    writeJson(responseStream, { error: "invalid json body" });
    return;
  }

  console.log(`[UPDATE_SESSION] sessionId=${sessionId} userId=${userId} body=`, body);

  const updates = [];
  const names = {};
  const values = { ":uid": userId, ":now": nowEpoch() };

  if (typeof body.title === "string") {
    updates.push("#title = :title");
    names["#title"] = "title";
    values[":title"] = body.title.slice(0, TITLE_MAX);
  }

  if (typeof body.pinned === "boolean") {
    updates.push("pinned = :pinned");
    values[":pinned"] = body.pinned;
  }

  if (updates.length === 0) {
    writeJson(responseStream, { error: "nothing to update" });
    return;
  }

  updates.push("updatedAt = :now");

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionId },
        UpdateExpression: "SET " + updates.join(", "),
        ConditionExpression: "userId = :uid OR attribute_not_exists(userId)",
        ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
        ExpressionAttributeValues: values
      })
    );
    writeJson(responseStream, {
      success: true,
      sessionId,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.pinned !== undefined ? { pinned: body.pinned } : {})
    });
  } catch (err) {
    console.error(`[UPDATE_SESSION_ERROR] sessionId=${sessionId}:`, err);
    if (err?.name === "ConditionalCheckFailedException") {
      writeJson(responseStream, { error: "session not found" });
      return;
    }
    writeJson(responseStream, { error: `update failed: ${err?.message ?? err}` });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/auth/complete — session binding callback
// ─────────────────────────────────────────────────────────────

async function handleAuthComplete(event, responseStream, userId) {
  const params = event?.queryStringParameters ?? {};
  const sessionUri = params.session_id;

  if (!sessionUri) {
    writeJson(responseStream, { error: "session_id query parameter required" });
    return;
  }

  try {
    const { CompleteResourceTokenAuthCommand } =
      await import("@aws-sdk/client-bedrock-agentcore");
    await agent.send(
      new CompleteResourceTokenAuthCommand({
        sessionUri,
        userIdentifier: { userId }
      })
    );
    writeJson(responseStream, { success: true });
  } catch (err) {
    writeJson(responseStream, { error: `CompleteResourceTokenAuth failed: ${err?.message ?? err}` });
  }
}

// ─────────────────────────────────────────────────────────────
// Entry — route on method + rawPath
// ─────────────────────────────────────────────────────────────

export const handler = awslambda.streamifyResponse(
  async (event, responseStream, _context) => {
    const method = event?.requestContext?.http?.method ?? "POST";
    const rawPath = event?.rawPath ?? "/";

    if (method === "OPTIONS") {
      responseStream.end();
      return;
    }

    // Authenticate before routing so no handler can be reached unauthenticated.
    const auth = await authenticate(event);
    if (auth.error) {
      respondStatus(responseStream, 401, { error: auth.error });
      return;
    }
    const { userId } = auth;

    if (method === "POST" && rawPath.endsWith("/chat")) {
      await handleChat(event, responseStream, userId);
      return;
    }

    if (
      method === "POST" &&
      (rawPath.endsWith("/upload/presign") || rawPath.endsWith("/upload-url"))
    ) {
      await handlePresignUpload(event, responseStream, userId);
      return;
    }

    if (
      (method === "POST" || method === "GET") &&
      rawPath.includes("/auth/complete")
    ) {
      await handleAuthComplete(event, responseStream, userId);
      return;
    }

    if (method === "GET" && rawPath.endsWith("/sessions")) {
      await handleListSessions(event, responseStream, userId);
      return;
    }

    const sessionMatch = rawPath.match(/\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sid = decodeURIComponent(sessionMatch[1]);
      if (method === "GET") {
        await handleGetSession(event, responseStream, sid, userId);
        return;
      }
      if (method === "DELETE") {
        await handleDeleteSession(event, responseStream, sid, userId);
        return;
      }
      if (method === "PATCH" || method === "PUT") {
        await handleUpdateSession(event, responseStream, sid, userId);
        return;
      }
    }

    writeJson(responseStream, { error: `unknown route: ${method} ${rawPath}` });
  }
);
