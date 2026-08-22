import { useEffect, useMemo, useRef } from "react";
import { formatRecency, groupByRecency } from "../lib/format";
import type { SessionSummary } from "../lib/types";

interface Props {
  sessions: SessionSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onToggle: () => void;
}

export function Sidebar({
  sessions,
  activeId,
  loading,
  onSelect,
  onNew,
  onToggle
}: Props) {
  const groups = useMemo(() => groupByRecency(sessions), [sessions]);

  // Rows already on screen when the list first arrives are not "new" — the
  // initial load shouldn't cascade, it's the path to the first click.
  const seen = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const isNewRow = (id: string) => seeded.current && !seen.current.has(id);

  useEffect(() => {
    if (loading) return;
    sessions.forEach((s) => seen.current.add(s.sessionId));
    seeded.current = true;
  }, [sessions, loading]);

  return (
    <aside className="sidebar">
      <header className="sidebar__head">
        <button
          className="sidebar__brand"
          onClick={onToggle}
          aria-label="collapse sidebar"
        >
          <span className="mark" aria-hidden>
            ◆
          </span>
          <span className="sidebar__brand-text">atelier</span>
        </button>
      </header>

      <div className="sidebar__list">
        {loading ? (
          <div className="sidebar__empty">
            <p className="sidebar__empty-text">Loading…</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="sidebar__empty">
            <p className="sidebar__empty-text">No conversations yet</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="sidebar__group">
              <h2 className="sidebar__group-label">{group.label}</h2>
              <ul className="sidebar__items">
                {group.items.map((s) => (
                  <li key={s.sessionId}>
                    <button
                      className={
                        "session" +
                        (activeId === s.sessionId ? " session--active" : "")
                      }
                      data-new={isNewRow(s.sessionId) ? "true" : undefined}
                      onClick={() => onSelect(s.sessionId)}
                    >
                      <span className="session__title">
                        {s.title?.trim() || "Untitled"}
                      </span>
                      <span className="session__time mono tnum">
                        {formatRecency(s.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <footer className="sidebar__foot">
        <button
          className="sidebar__new"
          onClick={onNew}
          aria-label="start a new conversation"
        >
          <span className="sidebar__new-icon" aria-hidden>
            +
          </span>
          <span>New chat</span>
          <span className="sidebar__new-kbd mono" aria-hidden>
            ⌘K
          </span>
        </button>
      </footer>
    </aside>
  );
}
