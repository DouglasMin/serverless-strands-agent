import type { SessionSummary } from "./types";

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
 * - today  → "HH:MM"
 * - yesterday → "yest."
 * - this year → "mmm d"
 * - older → "yyyy.mm"
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
