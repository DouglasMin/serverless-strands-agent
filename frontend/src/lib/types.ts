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
  routePreviews?: RoutePreview[];
  documents?: DocumentArtifact[];
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
  fileType: "excel" | "word" | "powerpoint" | string;
  sizeBytes: number;
  dataUri: string;
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

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools?: ToolUse[];
  routePreviews?: RoutePreview[];
  artifacts?: ArtifactItem[];
  documents?: DocumentArtifact[];
}

export type StreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "tool_use"; name: string }
  | { type: "route_preview"; preview: RoutePreview }
  | { type: "document_artifact"; document: DocumentArtifact }
  | { type: "auth_url"; url: string }
  | { type: "done"; sessionId: string }
  | { type: "error"; message: string }
  | { type: "warn"; message: string };
