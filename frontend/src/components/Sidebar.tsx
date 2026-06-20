import { useMemo } from "react";
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

  return (
    <aside className="sidebar">
      <header className="sidebar__head">
        <button
          className="sidebar__brand"
          onClick={onToggle}
          aria-label="collapse sidebar"
        >
          <span className="sidebar__brand-mark">¶</span>
          <span className="sidebar__brand-text">atelier</span>
        </button>
        <button
          className="sidebar__new"
          onClick={onNew}
          aria-label="start a new conversation"
        >
          <span className="sidebar__new-icon mono">+</span>
          <span className="sidebar__new-text">new</span>
        </button>
      </header>

      <div className="sidebar__list">
        {loading ? (
          <div className="sidebar__empty">
            <p className="mono sidebar__empty-text">loading…</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="sidebar__empty">
            <span className="sidebar__empty-mark serif">·</span>
            <p className="mono sidebar__empty-text">no conversations yet</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="sidebar__group">
              <h2 className="sidebar__group-label mono">— {group.label}</h2>
              <ul className="sidebar__items">
                {group.items.map((s) => (
                  <li key={s.sessionId}>
                    <button
                      className={
                        "session" +
                        (activeId === s.sessionId ? " session--active" : "")
                      }
                      onClick={() => onSelect(s.sessionId)}
                    >
                      <span className="session__title">
                        {s.title?.trim() || "untitled"}
                      </span>
                      <span className="session__time mono">
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
    </aside>
  );
}
