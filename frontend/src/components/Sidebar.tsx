import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatRecency, groupByRecency } from "../lib/format";
import type { SessionSummary } from "../lib/types";

interface Props {
  sessions: SessionSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onToggle: () => void;
  onDeleteSession?: (id: string) => void;
  onRenameSession?: (id: string, newTitle: string) => void;
  onTogglePin?: (id: string, pinned: boolean) => void;
}

export function Sidebar({
  sessions,
  activeId,
  loading,
  onSelect,
  onNew,
  onToggle,
  onDeleteSession,
  onRenameSession,
  onTogglePin
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        (s.title || "Untitled").toLowerCase().includes(q) ||
        s.sessionId.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  const groups = useMemo(() => groupByRecency(filteredSessions), [filteredSessions]);

  // Track new rows for entrance animation
  const seen = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const isNewRow = (id: string) => seeded.current && !seen.current.has(id);

  useEffect(() => {
    if (loading) return;
    sessions.forEach((s) => seen.current.add(s.sessionId));
    seeded.current = true;
  }, [sessions, loading]);

  // Focus edit input when starting rename
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "/" || (e.key === "f" && (e.metaKey || e.ctrlKey))) &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const startRename = (s: SessionSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmDeleteId(null);
    setEditingId(s.sessionId);
    setEditTitle(s.title?.trim() || "Untitled");
  };

  const isSavingRef = useRef(false);

  const saveRename = (sessionId: string) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    const trimmed = editTitle.trim();
    if (trimmed && onRenameSession) {
      onRenameSession(sessionId, trimmed);
    }
    setEditingId(null);
    setTimeout(() => {
      isSavingRef.current = false;
    }, 100);
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  const handleDelete = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirmDeleteId === sessionId) {
      if (onDeleteSession) onDeleteSession(sessionId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(sessionId);
    }
  };

  const handleTogglePin = (sessionId: string, currentPinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onTogglePin) {
      onTogglePin(sessionId, !currentPinned);
    }
  };

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

        <button
          className="sidebar__collapse-btn"
          onClick={onToggle}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          ⇤
        </button>
      </header>

      {/* Search / Filter bar */}
      <div className="sidebar__search-wrap">
        <div className="sidebar__search">
          <span className="sidebar__search-icon" aria-hidden>
            🔍
          </span>
          <input
            ref={searchInputRef}
            type="text"
            className="sidebar__search-input"
            placeholder="Search chats…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery ? (
            <button
              className="sidebar__search-clear"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              ✕
            </button>
          ) : (
            <kbd className="sidebar__search-kbd mono" title="Press / to search">
              /
            </kbd>
          )}
        </div>
      </div>

      <div className="sidebar__list" onClick={() => setConfirmDeleteId(null)}>
        {loading ? (
          <div className="sidebar__empty">
            <span className="sidebar__spinner" />
            <p className="sidebar__empty-text">Loading sessions…</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="sidebar__empty">
            <p className="sidebar__empty-text">
              {searchQuery ? "No matching chats" : "No conversations yet"}
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="sidebar__group">
              <div className="sidebar__group-header">
                <h2 className="sidebar__group-label">{group.label}</h2>
                <span className="sidebar__group-count mono">{group.items.length}</span>
              </div>
              <ul className="sidebar__items">
                {group.items.map((s) => {
                  const isEditing = editingId === s.sessionId;
                  const isConfirmingDelete = confirmDeleteId === s.sessionId;
                  const isActive = activeId === s.sessionId;

                  return (
                    <li key={s.sessionId} className="sidebar__item-wrap">
                      {isEditing ? (
                        <div className="session-edit-box">
                          <input
                            ref={editInputRef}
                            type="text"
                            className="session-edit-input"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename(s.sessionId);
                              if (e.key === "Escape") cancelRename();
                            }}
                            onBlur={() => saveRename(s.sessionId)}
                          />
                          <button
                            type="button"
                            className="session-edit-btn"
                            onMouseDown={() => saveRename(s.sessionId)}
                            title="Save"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div
                          className={`session-row ${isActive ? "session-row--active" : ""}`}
                          data-new={isNewRow(s.sessionId) ? "true" : undefined}
                          onClick={() => onSelect(s.sessionId)}
                        >
                          <button
                            type="button"
                            className="session-row__main"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(s.sessionId);
                            }}
                            title={s.title?.trim() || "Untitled"}
                          >
                            <span className="session__title">
                              {s.pinned && <span className="session__pin-icon">📌 </span>}
                              {s.title?.trim() || "Untitled"}
                            </span>
                            <span className="session__time mono tnum">
                              {formatRecency(s.updatedAt)}
                            </span>
                          </button>

                          {/* Quick Action Buttons on hover / active */}
                          <div className="session-row__actions">
                            <button
                              type="button"
                              className={`session-action-btn ${s.pinned ? "is-pinned" : ""}`}
                              onClick={(e) => handleTogglePin(s.sessionId, Boolean(s.pinned), e)}
                              title={s.pinned ? "Unpin chat" : "Pin to top"}
                            >
                              📌
                            </button>
                            <button
                              type="button"
                              className="session-action-btn"
                              onClick={(e) => startRename(s, e)}
                              title="Rename chat"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className={`session-action-btn session-action-btn--delete ${
                                isConfirmingDelete ? "is-confirming" : ""
                              }`}
                              onClick={(e) => handleDelete(s.sessionId, e)}
                              title={isConfirmingDelete ? "Click again to confirm delete" : "Delete chat"}
                            >
                              {isConfirmingDelete ? "🗑️ Confirm?" : "🗑️"}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
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
