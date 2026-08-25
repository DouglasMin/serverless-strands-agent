import { useEffect, useRef, useState } from "react";
import type {
  ArtifactItem,
  ChatMessage,
  RoutePreview,
  SubAgentTask,
  TraceInfo
} from "../lib/types";
import { AssistantMessage } from "./messages/AssistantMessage";
import { UserMessage } from "./messages/UserMessage";

const SUGGESTIONS = [
  "What's on my calendar today?",
  "Route to my next meeting",
  "How did NVDA close today?",
  "Write a python script to simulate a random walk",
  "Draw an architecture diagram of this system in mermaid"
];

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  empty?: boolean;
  swapping?: boolean;
  onSetReminder?: (preview: RoutePreview) => void;
  onSuggest?: (text: string) => void;
  onOpenArtifact?: (artifact: ArtifactItem) => void;
  onOpenTrace?: (trace: TraceInfo) => void;
  onOpenSubAgent?: (task: SubAgentTask) => void;
}

export function MessageList({
  messages,
  streaming,
  error,
  swapping,
  onSetReminder,
  onSuggest,
  onOpenArtifact,
  onOpenTrace,
  onOpenSubAgent
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const next = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (next === pinnedRef.current) return;
    pinnedRef.current = next;
    setPinned(next);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = true;
    setPinned(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  useEffect(() => {
    if (!swapping) return;
    pinnedRef.current = true;
    setPinned(true);
  }, [swapping]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: streaming ? "auto" : "smooth"
    });
  }, [messages, streaming]);

  if (swapping && messages.length === 0) {
    return (
      <div className="messages-region">
        <div className="messages messages--empty" ref={scrollRef}>
          <div className="empty">
            <span
              className="subagent-canvas__spinner"
              style={{ width: 28, height: 28, borderWidth: 3 }}
            />
            <p className="empty__hint mono" style={{ marginTop: 16 }}>
              Loading conversation...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="messages-region">
        <div className="messages messages--empty" ref={scrollRef}>
          <div className="empty">
            <div className="empty__glyph mono" aria-hidden>
              §
            </div>
            <h2 className="empty__title">Serverless Strands Studio</h2>
            <p className="empty__desc">
              Multi-agent serverless workspace powered by Bedrock AgentCore, A2A Deep Research, and Microsoft Office document synthesis.
            </p>
            <div className="empty__suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="empty__chip mono"
                  onClick={() => onSuggest?.(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-region">
      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        <div className="messages__inner">
          {messages.map((m, idx) => {
            const isLatest = idx === messages.length - 1;
            const isStreamingThis = streaming && isLatest && m.role === "assistant";

            if (m.role === "user") {
              return <UserMessage key={idx} message={m} />;
            }

            return (
              <AssistantMessage
                key={idx}
                message={m}
                isStreamingThis={isStreamingThis}
                onSetReminder={onSetReminder}
                onOpenArtifact={onOpenArtifact}
                onOpenTrace={onOpenTrace}
                onOpenSubAgent={onOpenSubAgent}
              />
            );
          })}

          {error && (
            <div className="msg msg--error">
              <span className="msg__error-icon">!</span>
              <div className="msg__text">{error}</div>
            </div>
          )}
        </div>
      </div>

      {!pinned && (
        <button
          type="button"
          className="jump-latest mono"
          onClick={jumpToLatest}
          aria-label="Jump to latest message"
        >
          ↓ latest
        </button>
      )}
    </div>
  );
}
