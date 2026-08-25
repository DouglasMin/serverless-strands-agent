import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "./components/Composer";
import { Header } from "./components/Header";
import { MessageList } from "./components/MessageList";
import { SignIn } from "./components/SignIn";
import { Sidebar } from "./components/Sidebar";

const StudioDrawer = lazy(() =>
  import("./components/studio/StudioDrawer").then((m) => ({ default: m.StudioDrawer }))
);
import {
  UnauthorizedError,
  deleteSession,
  fetchSession,
  fetchSessions,
  renameSession,
  streamChat,
  togglePinSession
} from "./lib/api";
import {
  completeSignIn,
  currentUser,
  isAuthConfigured,
  signIn,
  signOut,
  type AuthUser
} from "./lib/auth";
import { getCurrentLocation, promptLikelyNeedsLocation } from "./lib/geolocation";
import type {
  ArtifactItem,
  ChatMessage,
  FileAttachment,
  RoutePreview,
  SessionSummary,
  SubAgentTask,
  TraceInfo,
  UserLocation
} from "./lib/types";
import "./App.css";

const isNarrow = () => window.matchMedia("(max-width: 768px)").matches;

type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; error?: string }
  | { status: "signedIn"; user: AuthUser };

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => !isNarrow());
  const [swapping, setSwapping] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactItem | null>(null);
  const [activeTrace, setActiveTrace] = useState<TraceInfo | null>(null);
  const [activeSubAgentTask, setActiveSubAgentTask] = useState<SubAgentTask | null>(null);

  // Incremented on every session switch / clear so in-flight fetches discard.
  const loadSeq = useRef(0);

  // Clear any legacy session query params from browser URL on mount
  useEffect(() => {
    try {
      localStorage.removeItem("lastActiveSessionId");
    } catch {}
    if (window.location.search.includes("session=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  /* ─── auth bootstrap ─────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!isAuthConfigured()) {
        if (!cancelled) {
          setAuth({
            status: "signedOut",
            error: "Cognito environment variables are missing."
          });
        }
        return;
      }

      if (window.location.search.includes("code=")) {
        const completed = await completeSignIn();
        if (cancelled) return;
        if (completed) {
          const user = await currentUser();
          if (user) {
            setAuth({ status: "signedIn", user });
            return;
          }
        }
      }

      const user = await currentUser();
      if (cancelled) return;
      if (user) {
        setAuth({ status: "signedIn", user });
      } else {
        setAuth({ status: "signedOut" });
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthFailure = useCallback((err: unknown): boolean => {
    if (err instanceof UnauthorizedError) {
      setAuth({ status: "signedOut" });
      return true;
    }
    return false;
  }, []);

  const startSignIn = useCallback(() => {
    void signIn();
  }, []);

  /* ─── session listing ────────────────────────────────────── */

  const refreshSessions = useCallback(async () => {
    if (auth.status !== "signedIn") return;
    setSessionsLoading(true);
    try {
      const list = await fetchSessions();
      setSessions(list);
    } catch (err) {
      if (!handleAuthFailure(err)) {
        console.warn("failed to fetch sessions:", err);
      }
    } finally {
      setSessionsLoading(false);
    }
  }, [auth.status, handleAuthFailure]);

  useEffect(() => {
    if (auth.status === "signedIn") {
      void refreshSessions();
    } else {
      setSessions([]);
      setActiveId(null);
      setMessages([]);
    }
  }, [auth.status, refreshSessions]);

  /* ─── session selection ──────────────────────────────────── */

  const openSession = useCallback(
    async (sessionId: string) => {
      setStreaming(false);
      const seq = ++loadSeq.current;
      setActiveId(sessionId);
      setError(null);
      if (isNarrow()) setSidebarOpen(false);
      setSwapping(true);

      try {
        const detail = await fetchSession(sessionId);
        if (seq !== loadSeq.current) return;
        const loaded: ChatMessage[] = (detail.messages ?? []).map((m: any) => ({
          role: m.role,
          text: m.content || m.text || "",
          routePreviews: m.routePreviews,
          documents: m.documents,
          attachments: m.attachments,
          trace: m.trace
        }));
        setMessages(loaded);
      } catch (err) {
        if (seq !== loadSeq.current) return;
        if (handleAuthFailure(err)) return;
        setMessages([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (seq === loadSeq.current) setSwapping(false);
      }
    },
    [handleAuthFailure]
  );

  const startNewChat = useCallback(() => {
    setStreaming(false);
    loadSeq.current += 1;
    setActiveId(null);
    setMessages([]);
    setSwapping(false);
    setError(null);
    if (isNarrow()) setSidebarOpen(false);
  }, []);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      if (activeId === sessionId) {
        startNewChat();
      }
      try {
        await deleteSession(sessionId);
      } catch (err) {
        console.error("Failed to delete session:", err);
        void refreshSessions();
      }
    },
    [activeId, startNewChat, refreshSessions]
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, newTitle: string) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId === sessionId ? { ...s, title: newTitle } : s
        )
      );
      try {
        await renameSession(sessionId, newTitle);
      } catch (err) {
        console.error("Failed to rename session:", err);
        void refreshSessions();
      }
    },
    [refreshSessions]
  );

  const handleTogglePin = useCallback(
    async (sessionId: string, pinned: boolean) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId === sessionId ? { ...s, pinned } : s
        )
      );
      try {
        await togglePinSession(sessionId, pinned);
      } catch (err) {
        console.error("Failed to toggle pin:", err);
        void refreshSessions();
      }
    },
    [refreshSessions]
  );

  // ⌘K / Ctrl+K starts a new chat
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      startNewChat();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startNewChat]);

  // ⌘I / Ctrl+I toggles trace inspector
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "i" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setActiveTrace((curr) => {
        if (curr) return null;
        const lastWithTrace = [...messages]
          .reverse()
          .find((m) => m.role === "assistant" && m.trace);
        return lastWithTrace?.trace ?? null;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [messages]);

  const send = useCallback(
    async (prompt: string, attachments?: FileAttachment[]) => {
      if (streaming) return;
      loadSeq.current += 1;
      setSwapping(false);
      setError(null);

      let capturedSessionId = activeId;
      setMessages((prev) => [
        ...prev,
        { role: "user", text: prompt, attachments },
        { role: "assistant", text: "" }
      ]);
      setStreaming(true);

      const seenAuthUrls = new Set<string>();

      try {
        let userLocation: UserLocation | null = null;
        if (promptLikelyNeedsLocation(prompt)) {
          try {
            userLocation = await getCurrentLocation();
          } catch (err) {
            console.warn("geolocation unavailable:", err);
          }
        }

        for await (const ev of streamChat({
          sessionId: activeId,
          prompt,
          userLocation,
          attachments
        })) {
          switch (ev.type) {
            case "session":
              if (ev.sessionId) {
                capturedSessionId = ev.sessionId;
                setActiveId(ev.sessionId);
              }
              break;
            case "auth_url":
              if (!seenAuthUrls.has(ev.url)) {
                seenAuthUrls.add(ev.url);
                window.open(ev.url, "oauth_popup", "width=600,height=700");
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === "assistant") {
                    next[next.length - 1] = {
                      ...last,
                      text:
                        last.text +
                        "\n\nAuthorization required - a popup has opened. Please complete the sign-in.\n\n"
                    };
                  }
                  return next;
                });
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

                  const tasks = last.subagentTasks ? [...last.subagentTasks] : [];
                  if (ev.name.includes("deep_research") || ev.name.includes("research")) {
                    let currentTask = tasks[tasks.length - 1];
                    if (!currentTask || currentTask.status === "completed") {
                      currentTask = {
                        id: `task-${Date.now()}`,
                        agentName: "DeepResearchAgent",
                        topic: prompt,
                        depth: "comprehensive",
                        status: "searching",
                        startTime: Date.now(),
                        steps: [
                          {
                            time: new Date().toLocaleTimeString(),
                            tool: "research_agent",
                            query: prompt,
                            detail: `Initializing autonomous multi-vector deep research on '${prompt}'...`
                          }
                        ],
                        sources: []
                      };
                      tasks.push(currentTask);
                      setActiveSubAgentTask({ ...currentTask });
                    }
                  }

                  next[next.length - 1] = {
                    ...last,
                    tools,
                    ...(tasks.length > 0 ? { subagentTasks: tasks } : {})
                  };
                }
                return next;
              });
              break;
            case "delta":
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  const newText = last.text + ev.text;
                  const updatedTasks = last.subagentTasks?.map((t) => ({ ...t, summary: newText }));
                  next[next.length - 1] = {
                    ...last,
                    text: newText,
                    ...(updatedTasks ? { subagentTasks: updatedTasks } : {})
                  };
                  setActiveSubAgentTask((curr) => (curr ? { ...curr, summary: newText } : null));
                }
                return next;
              });
              break;
            case "route_preview":
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    routePreviews: [...(last.routePreviews ?? []), ev.preview]
                  };
                }
                return next;
              });
              break;
            case "document_artifact":
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    documents: [...(last.documents ?? []), ev.document]
                  };
                }
                return next;
              });
              break;
            case "subagent_event": {
              const subEv = ev.subagent;
              if (!subEv || typeof subEv !== "object") break;

              const nowStr = new Date().toLocaleTimeString();
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  const tasks = [...(last.subagentTasks ?? [])];
                  let currentTask = tasks[tasks.length - 1];

                  if (!currentTask || currentTask.status === "completed") {
                    currentTask = {
                      id: `task-${Date.now()}`,
                      agentName: subEv.agent || "DeepResearchAgent",
                      topic: subEv.topic || prompt,
                      depth: subEv.depth || "comprehensive",
                      status: "planning",
                      startTime: Date.now(),
                      steps: [],
                      sources: []
                    };
                    tasks.push(currentTask);
                  }

                  if (subEv.type === "subagent_step") {
                    currentTask.steps = [
                      ...currentTask.steps,
                      {
                        time: nowStr,
                        tool: subEv.tool,
                        query: subEv.query,
                        detail: subEv.detail || subEv.message || "Executing research mission..."
                      }
                    ];
                    if (subEv.stage === "planning") currentTask.status = "planning";
                    else if (subEv.stage === "searching") currentTask.status = "searching";
                    else if (subEv.stage === "synthesizing") currentTask.status = "synthesizing";
                    else if (subEv.stage === "completed") {
                      currentTask.status = "completed";
                      currentTask.endTime = Date.now();
                    } else if (subEv.stage === "error") {
                      currentTask.status = "error";
                      currentTask.endTime = Date.now();
                    } else {
                      currentTask.status = "searching";
                    }
                  } else if (subEv.type === "subagent_source") {
                    currentTask.sources = [
                      ...currentTask.sources,
                      {
                        title: subEv.title || "Untitled",
                        url: subEv.url || "",
                        source: subEv.source || "web",
                        snippet: subEv.snippet,
                        published: subEv.published,
                        score: subEv.score
                      }
                    ];
                    currentTask.status = "searching";
                  }

                  next[next.length - 1] = {
                    ...last,
                    subagentTasks: tasks
                  };

                  setActiveSubAgentTask({ ...currentTask });
                }
                return next;
              });
              break;
            }
            case "trace":
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    trace: ev.trace
                  };
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
        if (!handleAuthFailure(err)) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setStreaming(false);
        if (capturedSessionId) {
          void refreshSessions();
        }
      }
    },
    [activeId, streaming, handleAuthFailure, refreshSessions]
  );

  const setReminderFromPreview = useCallback(
    (preview: RoutePreview) => {
      if (!preview.eventId) return;
      const minutes = preview.minutesBefore ?? 15;
      const calendarId = preview.calendarId ?? "primary";
      void send(
        `Set a popup reminder ${minutes} minutes before calendar event ${preview.eventId} on calendar ${calendarId}.`
      );
    },
    [send]
  );

  const activeSession = sessions.find((s) => s.sessionId === activeId);
  const headerTitle = activeSession?.title?.trim() || "Untitled";

  if (auth.status === "loading") return <div className="signin" />;
  if (auth.status === "signedOut") {
    return <SignIn onSignIn={startSignIn} error={auth.error} />;
  }

  return (
    <div
      className="app"
      data-sidebar={sidebarOpen ? "open" : "closed"}
      data-canvas={activeArtifact || activeSubAgentTask ? "open" : "closed"}
      data-trace={activeTrace ? "open" : "closed"}
    >
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        loading={sessionsLoading}
        onSelect={openSession}
        onNew={startNewChat}
        onToggle={() => setSidebarOpen((o) => !o)}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onTogglePin={handleTogglePin}
      />
      <div className="scrim" onClick={() => setSidebarOpen(false)} aria-hidden />
      <main className="main">
        <Header
          title={headerTitle}
          isNew={!activeId}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          userEmail={auth.user.email}
          onSignOut={signOut}
          messages={messages}
          sessionId={activeId}
        />
        <MessageList
          messages={messages}
          streaming={streaming}
          error={error}
          empty={!activeId && messages.length === 0}
          swapping={swapping}
          onSetReminder={setReminderFromPreview}
          onSuggest={send}
          onOpenArtifact={setActiveArtifact}
          onOpenTrace={setActiveTrace}
          onOpenSubAgent={setActiveSubAgentTask}
        />
        <Composer onSend={send} disabled={streaming} sessionId={activeId} />
      </main>

      <Suspense fallback={null}>
        {(activeArtifact || activeSubAgentTask || activeTrace) && (
          <StudioDrawer
            artifact={activeArtifact}
            subagentTask={activeSubAgentTask}
            trace={activeTrace}
            onClose={() => {
              setActiveArtifact(null);
              setActiveSubAgentTask(null);
              setActiveTrace(null);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
