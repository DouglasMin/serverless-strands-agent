export interface SessionSummary {
  sessionId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export interface SessionDetail extends SessionSummary {
  messages: StoredMessage[];
}

export interface ToolUse {
  name: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools?: ToolUse[];
}

export type StreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "tool_use"; name: string }
  | { type: "auth_url"; url: string }
  | { type: "done"; sessionId: string }
  | { type: "error"; message: string }
  | { type: "warn"; message: string };
