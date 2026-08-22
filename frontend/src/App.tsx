import { useCallback, useEffect, useRef, useState } from "react";
import { ArtifactCanvas } from "./components/ArtifactCanvas";
import { Composer } from "./components/Composer";
import { Header } from "./components/Header";
import { MessageList } from "./components/MessageList";
import { SignIn } from "./components/SignIn";
import { Sidebar } from "./components/Sidebar";
import {
  UnauthorizedError,
  fetchSession,
  fetchSessions,
  streamChat
} from "./lib/api";
import {
  completeSignIn,
  currentUser,
  getIdToken,
  isAuthConfigured,
  signIn,
  signOut,
  type AuthUser
} from "./lib/auth";
import { getCurrentLocation, promptLikelyNeedsLocation } from "./lib/geolocation";
import type {
  ArtifactItem,
  ChatMessage,
  RoutePreview,
  SessionSummary,
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
  const signedIn = auth.status === "signedIn";
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // On narrow screens the sidebar is an overlay — start it out of the way.
  const [sidebarOpen, setSidebarOpen] = useState(() => !isNarrow());
  // True while a different transcript is being fetched — drives the crossfade.
  const [swapping, setSwapping] = useState(false);
  // Guards against a slow fetch landing after a newer one (or a new chat).
  const loadSeq = useRef(0);

  // Runs once on load: finishes a redirect if we just came back from Cognito,
  // otherwise revives (and silently refreshes) any stored session.
  useEffect(() => {
    void (async () => {
      if (!isAuthConfigured()) {
        setAuth({
          status: "signedOut",
          error:
            "Auth is not configured — build with VITE_COGNITO_DOMAIN and VITE_COGNITO_CLIENT_ID set."
        });
        return;
      }
      try {
        await completeSignIn();
      } catch (err) {
        setAuth({
          status: "signedOut",
          error: err instanceof Error ? err.message : String(err)
        });
        return;
      }
      const token = await getIdToken();
      const user = token ? currentUser() : null;
      setAuth(user ? { status: "signedIn", user } : { status: "signedOut" });
    })();
  }, []);

  // A token can die mid-session (refresh revoked, pool client changed). Drop
  // straight back to the sign-in screen rather than showing a bare HTTP error.
  const handleAuthFailure = useCallback((err: unknown): boolean => {
    if (!(err instanceof UnauthorizedError)) return false;
    setAuth({ status: "signedOut" });
    return true;
  }, []);

  const startSignIn = useCallback(() => {
    void signIn().catch((err: unknown) => {
      setAuth({
        status: "signedOut",
        error: err instanceof Error ? err.message : String(err)
      });
    });
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await fetchSessions();
      setSessions(list);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      // List failures are non-fatal — sidebar just stays as-is.
      console.warn("session list failed:", err);
    } finally {
      setSessionsLoading(false);
    }
  }, [handleAuthFailure]);

  useEffect(() => {
    if (!signedIn) return;
    void refreshSessions();
  }, [refreshSessions, signedIn]);

  const openSession = useCallback(
    async (sessionId: string) => {
      if (streaming) return;
      const seq = ++loadSeq.current;
      setActiveId(sessionId);
      setError(null);
      if (isNarrow()) setSidebarOpen(false);
      // Deliberately NOT clearing messages here. Emptying the column before
      // the fetch resolves flashes a blank panel for the whole round-trip;
      // the outgoing transcript stays put and fades out instead.
      setSwapping(true);
      try {
        const detail = await fetchSession(sessionId);
        if (seq !== loadSeq.current) return;
        setMessages(
          detail.messages.map((m) => ({
            role: m.role,
            text: m.content,
            routePreviews: m.routePreviews
          }))
        );
      } catch (err) {
        if (seq !== loadSeq.current) return;
        if (handleAuthFailure(err)) return;
        setMessages([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (seq === loadSeq.current) setSwapping(false);
      }
    },
    [streaming, handleAuthFailure]
  );

  const startNewChat = useCallback(() => {
    if (streaming) return;
    // Bump the sequence so an in-flight session fetch can't repopulate
    // the transcript we just cleared.
    loadSeq.current += 1;
    setActiveId(null);
    setMessages([]);
    setSwapping(false);
    setError(null);
    if (isNarrow()) setSidebarOpen(false);
  }, [streaming]);

  // ⌘K / Ctrl+K starts a new chat. Deliberately unanimated — a shortcut
  // used this often should feel instant, not staged.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      startNewChat();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startNewChat]);

  const send = useCallback(
    async (prompt: string) => {
      if (streaming) return;
      // A session fetch still in flight must not overwrite what we stream.
      loadSeq.current += 1;
      setSwapping(false);
      setError(null);
      setMessages((prev) => [
        ...prev,
        { role: "user", text: prompt },
        { role: "assistant", text: "" }
      ]);
      setStreaming(true);

      let capturedSessionId = activeId;
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
          userLocation
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
        // Refresh so the new session (or updated title/updatedAt) shows up.
        void refreshSessions();
        if (capturedSessionId && capturedSessionId !== activeId) {
          setActiveId(capturedSessionId);
        }
      }
    },
    [activeId, streaming, refreshSessions, handleAuthFailure]
  );

  const setReminderFromPreview = useCallback(
    (preview: RoutePreview) => {
      if (!preview.eventId) return;
      const minutes =
        preview.minutesBefore ??
        Math.max(10, Math.ceil((preview.durationSeconds ?? 1800) / 60) + 10);
      const calendarId = preview.calendarId ?? "primary";
      void send(
        `Set a popup reminder ${minutes} minutes before calendar event ${preview.eventId} on calendar ${calendarId}.`
      );
    },
    [send]
  );

  const [activeArtifact, setActiveArtifact] = useState<ArtifactItem | null>(null);

  const activeSession = sessions.find((s) => s.sessionId === activeId);
  const headerTitle = activeSession?.title?.trim() || "Untitled";

  // Every hook above runs unconditionally; only the render branches.
  if (auth.status === "loading") return <div className="signin" />;
  if (auth.status === "signedOut") {
    return <SignIn onSignIn={startSignIn} error={auth.error} />;
  }

  return (
    <div
      className="app"
      data-sidebar={sidebarOpen ? "open" : "closed"}
      data-canvas={activeArtifact ? "open" : "closed"}
    >
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        loading={sessionsLoading}
        onSelect={openSession}
        onNew={startNewChat}
        onToggle={() => setSidebarOpen((o) => !o)}
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
        />
        <Composer onSend={send} disabled={streaming} />
      </main>

      {activeArtifact && (
        <ArtifactCanvas
          artifact={activeArtifact}
          onClose={() => setActiveArtifact(null)}
        />
      )}
    </div>
  );
}
