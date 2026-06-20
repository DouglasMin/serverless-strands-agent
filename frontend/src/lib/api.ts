import type {
  SessionDetail,
  SessionSummary,
  StreamEvent
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

/* ─── REST endpoints ─────────────────────────────────────── */

export async function fetchSessions(userId: string): Promise<SessionSummary[]> {
  const res = await fetch(
    `${BASE}/api/sessions?userId=${encodeURIComponent(userId)}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return (body.sessions ?? []) as SessionSummary[];
}

export async function fetchSession(
  sessionId: string,
  userId: string
): Promise<SessionDetail> {
  const res = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(userId)}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body as SessionDetail;
}

/* ─── SSE streaming chat ─────────────────────────────────── */

interface ChatOpts {
  sessionId: string | null;
  prompt: string;
  userId: string;
  signal?: AbortSignal;
}

export async function* streamChat({
  sessionId,
  prompt,
  userId,
  signal
}: ChatOpts): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, prompt, userId }),
    signal
  });

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
}

function parseFrame(frame: string): StreamEvent | null {
  let event = "message";
  const data: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
    }
  }

  const body = data.join("\n");
  if (!body) return null;

  switch (event) {
    case "session":
      return { type: "session", sessionId: safeJson(body)?.sessionId ?? "" };
    case "delta":
      return { type: "delta", text: safeJson(body)?.text ?? body };
    case "tool_use":
      return { type: "tool_use", name: safeJson(body)?.name ?? body };
    case "done":
      return { type: "done", sessionId: safeJson(body)?.sessionId ?? "" };
    case "error":
      return { type: "error", message: safeJson(body)?.message ?? body };
    case "warn":
      return { type: "warn", message: safeJson(body)?.message ?? body };
    default:
      return null;
  }
}

function safeJson(input: string): Record<string, string> | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}
