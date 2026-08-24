export interface SessionSummary {
  sessionId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

export interface FileAttachment {
  filename: string;
  s3Uri: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  uploading?: boolean;
  error?: string;
}

export interface TraceInfo {
  sessionId: string;
  durationMs: number;
  model: string;
  toolsUsed: string[];
  timestamp: number;
  memoryEnabled?: boolean;
  langfuseTraceId?: string;
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
  routePreviews?: RoutePreview[];
  documents?: DocumentArtifact[];
  attachments?: FileAttachment[];
  trace?: TraceInfo;
}

export interface SessionDetail extends SessionSummary {
  messages: StoredMessage[];
}

export interface ToolUse {
  name: string;
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt: number;
}

export interface RoutePreview {
  originLabel?: string;
  destinationLabel: string;
  origin?: {
    lat: number;
    lng: number;
  };
  destination?: {
    lat: number;
    lng: number;
  };
  distanceMeters?: number;
  distanceText?: string;
  durationSeconds?: number;
  durationText?: string;
  travelMode: string;
  polyline?: string;
  mapsUrl: string;
  routeStatus?: "ROUTE_OK" | "MAP_ONLY" | string;
  routeError?: string;
  eventId?: string;
  calendarId?: string;
  minutesBefore?: number;
}

export interface ArtifactItem {
  id: string;
  title: string;
  language?: string;
  type: "code" | "markdown" | "document" | "html";
  content: string;
}

export interface DocumentArtifact {
  filename: string;
  fileType?: "excel" | "word" | "powerpoint" | string;
  type?: string;
  sizeBytes?: number;
  dataUri?: string;
  url?: string;
  s3Uri?: string;
  summary?: string;
}

export interface StockQuoteData {
  symbol: string;
  name?: string;
  price: number;
  change?: number;
  changePercent?: number;
  currency?: string;
  high?: number;
  low?: number;
  volume?: number | string;
  historicalPoints?: { time: string; price: number }[];
}

export interface SubAgentStep {
  time: string;
  tool?: string;
  query?: string;
  detail: string;
}

export interface SubAgentSource {
  title: string;
  url: string;
  source: "web" | "arxiv" | "wikipedia" | string;
  snippet?: string;
  published?: string;
  score?: number;
}

export interface SubAgentTask {
  id: string;
  agentName: string;
  topic: string;
  depth?: string;
  status: "planning" | "searching" | "synthesizing" | "completed" | "error";
  startTime: number;
  endTime?: number;
  steps: SubAgentStep[];
  sources: SubAgentSource[];
  summary?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools?: ToolUse[];
  routePreviews?: RoutePreview[];
  artifacts?: ArtifactItem[];
  documents?: DocumentArtifact[];
  subagentTasks?: SubAgentTask[];
  attachments?: FileAttachment[];
  trace?: TraceInfo;
}

export type StreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "tool_use"; name: string }
  | { type: "route_preview"; preview: RoutePreview }
  | { type: "document_artifact"; document: DocumentArtifact }
  | { type: "subagent_event"; subagent: any }
  | { type: "auth_url"; url: string }
  | { type: "trace"; trace: TraceInfo }
  | { type: "done"; sessionId: string }
  | { type: "error"; message: string }
  | { type: "warn"; message: string };
