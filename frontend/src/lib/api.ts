import { getIdToken } from "./auth";
import type {
  FileAttachment,
  SessionDetail,
  SessionSummary,
  StreamEvent,
  RoutePreview,
  UserLocation
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

/** Thrown when the session is gone; callers surface the sign-in screen. */
export class UnauthorizedError extends Error {
  constructor() {
    super("session expired");
    this.name = "UnauthorizedError";
  }
}

// The user id is no longer sent by the client at all — the Lambda reads it
// from the verified `sub` claim, so a forged id is not expressible.
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  if (!token) throw new UnauthorizedError();
  return { authorization: `Bearer ${token}` };
}

/* ─── REST endpoints ─────────────────────────────────────── */

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${BASE}/api/sessions`, {
    headers: await authHeaders()
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return (body.sessions ?? []) as SessionSummary[];
}

export async function fetchSession(sessionId: string): Promise<SessionDetail> {
  const res = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(sessionId)}`,
    { headers: await authHeaders() }
  );
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body as SessionDetail;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      headers: await authHeaders()
    }
  );
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Delete failed (HTTP ${res.status})`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
}

export async function renameSession(
  sessionId: string,
  title: string
): Promise<void> {
  const res = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(await authHeaders())
      },
      body: JSON.stringify({ title })
    }
  );
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Rename failed (HTTP ${res.status})`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
}

export async function togglePinSession(
  sessionId: string,
  pinned: boolean
): Promise<void> {
  const res = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(await authHeaders())
      },
      body: JSON.stringify({ pinned })
    }
  );
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Toggle pin failed (HTTP ${res.status})`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
}

/* ─── S3 Presigned Upload ────────────────────────────────── */

export async function getPresignedUploadUrl(
  filename: string,
  contentType: string,
  sessionId?: string
): Promise<{
  uploadUrl: string;
  s3Uri: string;
  key: string;
  filename: string;
  contentType: string;
}> {
  const res = await fetch(`${BASE}/api/upload/presign`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ filename, contentType, sessionId })
  });

  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Upload presign failed (HTTP ${res.status})`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body;
}

export async function uploadFileToS3(
  file: File,
  sessionId?: string
): Promise<FileAttachment> {
  const presigned = await getPresignedUploadUrl(
    file.name,
    file.type || "application/octet-stream",
    sessionId
  );

  const uploadRes = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream"
    },
    body: file
  });

  if (!uploadRes.ok) {
    throw new Error(`S3 direct upload failed with status ${uploadRes.status}`);
  }

  return {
    filename: file.name,
    s3Uri: presigned.s3Uri,
    key: presigned.key,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size
  };
}

/* ─── SSE streaming chat ─────────────────────────────────── */

interface ChatOpts {
  sessionId: string | null;
  prompt: string;
  userLocation?: UserLocation | null;
  attachments?: FileAttachment[];
  signal?: AbortSignal;
}

export async function* streamChat({
  sessionId,
  prompt,
  userLocation,
  attachments,
  signal
}: ChatOpts): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      sessionId,
      prompt,
      userLocation,
      attachments: (attachments ?? []).map((a) => ({
        filename: a.filename,
        s3Uri: a.s3Uri,
        key: a.key,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes
      }))
    }),
    signal
  });

  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx: number;
    while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      const parsed = parseFrame(frame);
      if (parsed) yield parsed;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const parsed = parseFrame(buffer);
    if (parsed) yield parsed;
  }
}

function parseFrame(frame: string): StreamEvent | null {
  const trimmed = frame.trim();
  if (!trimmed || trimmed.startsWith(":")) return null;

  let eventType = "delta";
  let body = "";

  for (const line of trimmed.split("\n")) {
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      body = line.slice(5).trim();
    }
  }

  if (!body) return null;

  switch (eventType) {
    case "session":
      return {
        type: "session",
        sessionId: stringField(body, "sessionId", body)
      };
    case "delta":
      return { type: "delta", text: stringField(body, "text", body) };
    case "tool_use":
      return { type: "tool_use", name: stringField(body, "name", body) };
    case "route_preview": {
      const parsed = safeJson(body);
      if (!parsed) return null;
      return {
        type: "route_preview",
        preview: parsed as unknown as RoutePreview
      };
    }
    case "document_artifact": {
      const parsed = safeJson(body);
      if (!parsed) return null;
      return {
        type: "document_artifact",
        document: {
          filename: String(parsed.filename || "document"),
          fileType: String(parsed.file_type || parsed.fileType || "document"),
          sizeBytes: Number(parsed.size_bytes || parsed.sizeBytes || 0),
          dataUri: String(parsed.data_uri || parsed.dataUri || ""),
          summary: parsed.summary ? String(parsed.summary) : undefined
        }
      };
    }
    case "subagent_event": {
      const parsed = safeJson(body);
      return {
        type: "subagent_event",
        subagent: parsed || body
      };
    }
    case "auth_url":
      return { type: "auth_url", url: stringField(body, "url", body) };
    case "trace": {
      const parsed = safeJson(body);
      if (!parsed) return null;
      return {
        type: "trace",
        trace: {
          sessionId: String(parsed.sessionId || ""),
          durationMs: Number(parsed.durationMs || 0),
          model: String(parsed.model || "claude-3.7-sonnet"),
          toolsUsed: Array.isArray(parsed.toolsUsed) ? (parsed.toolsUsed as string[]) : [],
          timestamp: Number(parsed.timestamp || Date.now() / 1000),
          memoryEnabled: parsed.memoryEnabled !== undefined ? Boolean(parsed.memoryEnabled) : true,
          langfuseTraceId: parsed.langfuseTraceId ? String(parsed.langfuseTraceId) : undefined
        }
      };
    }
    case "done":
      return { type: "done", sessionId: stringField(body, "sessionId") };
    case "error":
      return { type: "error", message: stringField(body, "message", body) };
    case "warn":
      return { type: "warn", message: stringField(body, "message", body) };
    default:
      return null;
  }
}

function stringField(input: string, key: string, fallback = ""): string {
  const value = safeJson(input)?.[key];
  return typeof value === "string" ? value : fallback;
}

function safeJson(input: string): Record<string, unknown> | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}
