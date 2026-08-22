// handler.mjs — Lambda Function URL (RESPONSE_STREAM) entry point.
//
// Every route requires a Cognito ID token in `Authorization: Bearer <jwt>`.
// The caller's identity is taken from the verified `sub` claim only.
//
// Routes:
//   POST /api/chat             — stream agent response (SSE)
//   GET  /api/sessions         — list the caller's sessions
//   GET  /api/sessions/:id     — load one session's messages
//   POST /api/auth/complete    — finish an AgentCore Identity 3LO handshake

import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand
} from "@aws-sdk/client-bedrock-agentcore";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { randomUUID } from "node:crypto";

const REGION = process.env.AWS_REGION_NAME;
const AGENT_RUNTIME_ARN = process.env.AGENT_RUNTIME_ARN;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const USER_INDEX = process.env.SESSIONS_USER_INDEX ?? "byUser";
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const TITLE_MAX = 80;
const SESSION_LIST_LIMIT = 100;

const agent = new BedrockAgentCoreClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

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

async function appendMessage(sessionId, userId, role, content, extra = {}) {
  const t = nowEpoch();
  const message = { role, content, ts: t };
  if (Array.isArray(extra.routePreviews) && extra.routePreviews.length > 0) {
    message.routePreviews = extra.routePreviews;
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
      // `sessionId` arrives from the request body and AgentCore does not
      // enforce session-to-user mapping, so without this a caller could append
      // turns to somebody else's transcript (`if_not_exists` would even keep
      // the victim as owner). A brand-new session has no userId yet, which is
      // what the first clause allows. Enforced by DynamoDB rather than a
      // read-then-write so concurrent first turns cannot race past it.
      ConditionExpression: "attribute_not_exists(userId) OR userId = :uid",
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    })
  );
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

  let assistantText = "";
  const routePreviews = [];
  try {
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: AGENT_RUNTIME_ARN,
      runtimeSessionId: sessionId,
      qualifier: "DEFAULT",
      payload: new TextEncoder().encode(JSON.stringify({ prompt, userId, userLocation }))
    });
    command.middlewareStack.add(
      (next) => (args) => {
        args.request.headers["X-Amzn-Bedrock-AgentCore-Runtime-User-Id"] = userId;
        return next(args);
      },
      { step: "build", name: "addUserIdHeader" }
    );
    const resp = await agent.send(command);

    // AgentCore emits its own SSE — `data:` line per JSON-encoded text chunk.
    const decoder = new TextDecoder();
    let buffer = "";

    const flushFrame = (frame) => {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let text;
        try {
          const outer = JSON.parse(raw);
          if (typeof outer === "string") {
            // AgentCore double-encodes: try parsing the inner string as JSON
            try {
              const inner = JSON.parse(outer);
              if (inner && typeof inner === "object" && inner.__tool_use__) {
                writeFrame("tool_use", { name: inner.__tool_use__ });
                continue;
              }
              if (inner && typeof inner === "object" && inner.__auth_url__) {
                writeFrame("auth_url", { url: inner.__auth_url__ });
                continue;
              }
              if (inner && typeof inner === "object" && inner.__route_preview__) {
                routePreviews.push(inner.__route_preview__);
                writeFrame("route_preview", inner.__route_preview__);
                continue;
              }
            } catch {
              // not inner JSON — it's plain text
            }
            text = outer;
          } else if (outer && typeof outer === "object" && outer.__tool_use__) {
            writeFrame("tool_use", { name: outer.__tool_use__ });
            continue;
          } else if (outer && typeof outer === "object" && outer.__auth_url__) {
            writeFrame("auth_url", { url: outer.__auth_url__ });
            continue;
          } else if (outer && typeof outer === "object" && outer.__route_preview__) {
            routePreviews.push(outer.__route_preview__);
            writeFrame("route_preview", outer.__route_preview__);
            continue;
          } else {
            text = JSON.stringify(outer);
          }
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
  } catch (err) {
    writeSseError(responseStream, `Agent invoke failed: ${err?.message ?? err}`);
    return;
  }

  if (assistantText) {
    try {
      await appendMessage(sessionId, userId, "assistant", assistantText, {
        routePreviews
      });
    } catch (err) {
      writeFrame("warn", { message: `DDB persist failed: ${err?.message ?? err}` });
    }
  }

  writeFrame("done", { sessionId });
  responseStream.end();
}

// ─────────────────────────────────────────────────────────────
// GET /api/sessions — list the caller's sessions, newest first
// ─────────────────────────────────────────────────────────────

async function handleListSessions(_event, responseStream, userId) {
  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: SESSIONS_TABLE,
        IndexName: USER_INDEX,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        ScanIndexForward: false,
        Limit: SESSION_LIST_LIMIT,
        ProjectionExpression: "sessionId, title, createdAt, updatedAt"
      })
    );
    writeJson(responseStream, { sessions: res.Items ?? [] });
  } catch (err) {
    writeJson(responseStream, { error: `query failed: ${err?.message ?? err}` });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/sessions/:id — load full session messages (owner only)
// ─────────────────────────────────────────────────────────────

async function handleGetSession(_event, responseStream, sessionId, userId) {
  try {
    const res = await ddb.send(
      new GetCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionId }
      })
    );

    const item = res.Item;
    if (!item) {
      writeJson(responseStream, { error: "not found" });
      return;
    }

    // Ownership check. `userId` is a verified token claim, so this is a real
    // boundary rather than a comparison of two attacker-supplied strings.
    if (item.userId !== userId) {
      writeJson(responseStream, { error: "not found" });
      return;
    }

    writeJson(responseStream, {
      sessionId: item.sessionId,
      title: item.title ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      messages: item.messages ?? []
    });
  } catch (err) {
    writeJson(responseStream, { error: `get failed: ${err?.message ?? err}` });
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
    if (method === "GET" && sessionMatch) {
      await handleGetSession(event, responseStream, sessionMatch[1], userId);
      return;
    }

    writeJson(responseStream, { error: `unknown route: ${method} ${rawPath}` });
  }
);
