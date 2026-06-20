import { useCallback, useEffect, useState } from "react";
import { Composer } from "./components/Composer";
import { Header } from "./components/Header";
import { MessageList } from "./components/MessageList";
import { Sidebar } from "./components/Sidebar";
import { fetchSession, fetchSessions, streamChat } from "./lib/api";
import type { ChatMessage, SessionSummary } from "./lib/types";
import { getUserId } from "./lib/user";
import "./App.css";

export default function App() {
  const [userId] = useState(() => getUserId());
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await fetchSessions(userId);
      setSessions(list);
    } catch (err) {
      // List failures are non-fatal — sidebar just stays as-is.
      console.warn("session list failed:", err);
    } finally {
      setSessionsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const openSession = useCallback(
    async (sessionId: string) => {
      if (streaming) return;
      setActiveId(sessionId);
      setMessages([]);
      setError(null);
      try {
        const detail = await fetchSession(sessionId, userId);
        setMessages(
          detail.messages.map((m) => ({ role: m.role, text: m.content }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [streaming, userId]
  );

  const startNewChat = useCallback(() => {
    if (streaming) return;
    setActiveId(null);
    setMessages([]);
    setError(null);
  }, [streaming]);

  const send = useCallback(
    async (prompt: string) => {
      if (streaming) return;
      setError(null);
      setMessages((prev) => [
        ...prev,
        { role: "user", text: prompt },
        { role: "assistant", text: "" }
      ]);
      setStreaming(true);

      let capturedSessionId = activeId;

      try {
        for await (const ev of streamChat({
          sessionId: activeId,
          prompt,
          userId
        })) {
          switch (ev.type) {
            case "session":
              if (ev.sessionId) {
                capturedSessionId = ev.sessionId;
                setActiveId(ev.sessionId);
              }
              break;
            case "tool_use":
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  const tools = [...(last.tools ?? [])];
                  if (!tools.some((t) => t.name === ev.name)) {
                    tools.push({ name: ev.name });
                  }
                  next[next.length - 1] = { ...last, tools };
                }
                return next;
              });
              break;
            case "delta":
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, text: last.text + ev.text };
                }
                return next;
              });
              break;
            case "warn":
              console.warn(ev.message);
              break;
            case "error":
              setError(ev.message);
              break;
            case "done":
              break;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStreaming(false);
        // Refresh so the new session (or updated title/updatedAt) shows up.
        void refreshSessions();
        if (capturedSessionId && capturedSessionId !== activeId) {
          setActiveId(capturedSessionId);
        }
      }
    },
    [activeId, streaming, userId, refreshSessions]
  );

  const activeSession = sessions.find((s) => s.sessionId === activeId);
  const headerTitle = activeSession?.title?.trim() || "untitled";

  return (
    <div className="app" data-sidebar={sidebarOpen ? "open" : "closed"}>
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        loading={sessionsLoading}
        onSelect={openSession}
        onNew={startNewChat}
        onToggle={() => setSidebarOpen((o) => !o)}
      />
      <main className="main">
        <Header
          title={headerTitle}
          isNew={!activeId}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
        />
        <MessageList
          messages={messages}
          streaming={streaming}
          error={error}
          empty={!activeId && messages.length === 0}
        />
        <Composer onSend={send} disabled={streaming} />
      </main>
    </div>
  );
}
