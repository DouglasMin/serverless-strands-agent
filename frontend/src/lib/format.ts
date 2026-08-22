import type { DocumentArtifact, SessionSummary, StockQuoteData } from "./types";

interface SessionGroup {
  label: string;
  items: SessionSummary[];
}

const DAY = 86_400;

/**
 * Bucket sessions into human-friendly recency groups for the sidebar.
 */
export function groupByRecency(sessions: SessionSummary[]): SessionGroup[] {
  if (sessions.length === 0) return [];

  const todayStart = startOfDay(Date.now() / 1000);
  const yesterdayStart = todayStart - DAY;
  const weekStart = todayStart - 7 * DAY;
  const monthStart = todayStart - 30 * DAY;

  const today: SessionSummary[] = [];
  const yesterday: SessionSummary[] = [];
  const week: SessionSummary[] = [];
  const month: SessionSummary[] = [];
  const older: SessionSummary[] = [];

  for (const s of sessions) {
    const t = s.updatedAt;
    if (t >= todayStart) today.push(s);
    else if (t >= yesterdayStart) yesterday.push(s);
    else if (t >= weekStart) week.push(s);
    else if (t >= monthStart) month.push(s);
    else older.push(s);
  }

  const out: SessionGroup[] = [];
  if (today.length) out.push({ label: "today", items: today });
  if (yesterday.length) out.push({ label: "yesterday", items: yesterday });
  if (week.length) out.push({ label: "last 7 days", items: week });
  if (month.length) out.push({ label: "last 30 days", items: month });
  if (older.length) out.push({ label: "older", items: older });
  return out;
}

function startOfDay(epoch: number): number {
  const d = new Date(epoch * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Compact timestamp for sidebar entries.
 */
export function formatRecency(epoch: number): string {
  const d = new Date(epoch * 1000);
  const now = new Date();

  if (sameDay(d, now)) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "yest.";

  if (d.getFullYear() === now.getFullYear()) {
    return `${d.toLocaleString("en", { month: "short" }).toLowerCase()} ${d.getDate()}`;
  }

  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Extracts stock quote data from text if present.
 */
export function extractStockQuotes(text: string): StockQuoteData[] {
  if (!text) return [];
  const quotes: StockQuoteData[] = [];
  const seenSymbols = new Set<string>();

  const lineMatches = text.matchAll(
    /(?:^|\s|\*\*|\|)\s*([A-Z]{2,5})\s*(?:\([^\)]+\))?\s*(?::|\||\s)\s*\$?([0-9]+(?:\.[0-9]{2})?)\s*(?:USD|\$)?(?:\s*\(([+-]?[0-9]+(?:\.[0-9]+)?%?)\))?/gm
  );

  const ignored = new Set([
    "THE", "FOR", "AND", "URL", "SSE", "API", "JSON", "GET", "POST",
    "HTTP", "AWS", "USD", "KRW", "EUR", "GBP", "JPY", "INFO", "WARN"
  ]);

  for (const match of lineMatches) {
    const symbol = match[1];
    const price = parseFloat(match[2]);
    const rawChange = match[3];
    if (symbol && !isNaN(price) && price > 0 && !ignored.has(symbol) && !seenSymbols.has(symbol)) {
      seenSymbols.add(symbol);
      let changePercent: number | undefined;
      let change: number | undefined;
      if (rawChange) {
        changePercent = parseFloat(rawChange.replace("%", ""));
        if (!isNaN(changePercent)) {
          change = Number(((price * changePercent) / 100).toFixed(2));
        }
      }
      quotes.push({
        symbol,
        price,
        change,
        changePercent,
        currency: "$"
      });
    }
  }

  return quotes;
}

/**
 * Strips raw embedded document_artifact JSON envelopes from message text and parses them into DocumentArtifact objects.
 */
export function extractDocumentArtifacts(text: string): {
  cleanText: string;
  extractedDocs: DocumentArtifact[];
} {
  if (!text || !text.includes("document_artifact")) {
    return { cleanText: text, extractedDocs: [] };
  }

  const extractedDocs: DocumentArtifact[] = [];
  let cleanText = text;

  // Regex to match JSON objects containing document_artifact
  const docJsonRegex = /\{[\s\r\n]*"(?:type|__document_artifact__)"[\s\r\n]*:[\s\r\n]*"(?:document_artifact)"[\s\S]*?\}(?=(?:\s*\{|\s*$|\s*\n))/g;

  cleanText = cleanText.replace(docJsonRegex, (match) => {
    try {
      const parsed = JSON.parse(match);
      const doc = parsed.document || parsed.__document_artifact__ || parsed;
      if (doc && (doc.data_uri || doc.dataUri || doc.filename)) {
        extractedDocs.push({
          filename: String(doc.filename || "document"),
          fileType: String(doc.file_type || doc.fileType || "document"),
          sizeBytes: Number(doc.size_bytes || doc.sizeBytes || 0),
          dataUri: String(doc.data_uri || doc.dataUri || ""),
          summary: doc.summary ? String(doc.summary) : undefined
        });
        return ""; // remove from text
      }
    } catch {
      // ignore parse failures
    }
    return match;
  });

  return {
    cleanText: cleanText.trim(),
    extractedDocs
  };
}
