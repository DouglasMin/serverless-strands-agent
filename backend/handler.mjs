// handler.mjs — Lambda Function URL (RESPONSE_STREAM) entry point.
//
// Routes:
//   POST /api/chat             — stream agent response (SSE)
//   GET  /api/sessions         — list sessions for ?userId=…
//   GET  /api/sessions/:id     — load one session's messages

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
import { randomUUID } from "node:crypto";

const REGION = process.env.AWS_REGION_NAME;
const AGENT_RUNTIME_ARN = process.env.AGENT_RUNTIME_ARN;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const USER_INDEX = process.env.SESSIONS_USER_INDEX ?? "byUser";
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);

const TITLE_MAX = 80;
const SESSION_LIST_LIMIT = 100;

const agent = new BedrockAgentCoreClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

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

const parseBody = (event) => {
  const raw = event?.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf-8")
    : (event?.body ?? "{}");
  return JSON.parse(raw);
};

async function appendMessage(sessionId, userId, role, content) {
  const t = nowEpoch();
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
    ":msg": [{ role, content, ts: t }],
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
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    })
  );
}

// ─────────────────────────────────────────────────────────────
// POST /api/chat — stream agent response as SSE
// ─────────────────────────────────────────────────────────────

async function handleChat(event, responseStream) {
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
  const userId = body.userId ?? sessionId;
  writeFrame("session", { sessionId });

  try {
    await appendMessage(sessionId, userId, "user", prompt);
  } catch (err) {
    writeSseError(responseStream, `DDB write failed: ${err?.message ?? err}`);
    return;
  }

  let assistantText = "";
  try {
    const resp = await agent.send(
      new InvokeAgentRuntimeCommand({
        agentRuntimeArn: AGENT_RUNTIME_ARN,
        runtimeSessionId: sessionId,
        qualifier: "DEFAULT",
        payload: new TextEncoder().encode(JSON.stringify({ prompt, userId }))
      })
    );

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
            } catch {
              // not inner JSON — it's plain text
            }
            text = outer;
          } else if (typeof outer === "object" && outer.__tool_use__) {
            writeFrame("tool_use", { name: outer.__tool_use__ });
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
      await appendMessage(sessionId, userId, "assistant", assistantText);
    } catch (err) {
      writeFrame("warn", { message: `DDB persist failed: ${err?.message ?? err}` });
    }
  }

  writeFrame("done", { sessionId });
  responseStream.end();
}

// ─────────────────────────────────────────────────────────────
// GET /api/sessions?userId=… — list sessions, newest first
// ─────────────────────────────────────────────────────────────

async function handleListSessions(event, responseStream) {
  const userId = event?.queryStringParameters?.userId;
  if (!userId) {
    writeJson(responseStream, { error: "userId query parameter required" });
    return;
  }

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
// GET /api/sessions/:id?userId=… — load full session messages
// ─────────────────────────────────────────────────────────────

async function handleGetSession(event, responseStream, sessionId) {
  const userId = event?.queryStringParameters?.userId;

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

    // Quiet defense — anonymous setup, but don't cross-read.
    if (userId && item.userId && item.userId !== userId) {
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
// Entry — route on method + rawPath
// ─────────────────────────────────────────────────────────────

export const handler = awslambda.streamifyResponse(
  async (event, responseStream, _context) => {
    const method = event?.requestContext?.http?.method ?? "POST";
    const rawPath = event?.rawPath ?? "/";

    if (method === "OPTIONS") {
      // Function URL handles CORS preflight headers; just close cleanly.
      responseStream.end();
      return;
    }

    if (method === "POST" && rawPath.endsWith("/chat")) {
      await handleChat(event, responseStream);
      return;
    }

    if (method === "GET" && rawPath.endsWith("/sessions")) {
      await handleListSessions(event, responseStream);
      return;
    }

    const sessionMatch = rawPath.match(/\/sessions\/([^/]+)$/);
    if (method === "GET" && sessionMatch) {
      await handleGetSession(event, responseStream, sessionMatch[1]);
      return;
    }

    writeJson(responseStream, { error: `unknown route: ${method} ${rawPath}` });
  }
);
