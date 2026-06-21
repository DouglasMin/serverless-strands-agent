import { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import type { ChatMessage, ToolUse } from "../lib/types";

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  empty: boolean;
}

export function MessageList({ messages, streaming, error, empty }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  if (empty && messages.length === 0) {
    return (
      <div className="messages messages--empty" ref={scrollRef}>
        <div className="empty">
          <h2 className="empty__title">
            <span className="empty__title-text">untitled</span>
            <span className="empty__cursor">_</span>
          </h2>
          <p className="empty__hint mono">
            send a message below to begin a new conversation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages" ref={scrollRef}>
      <div className="messages__inner">
        {messages.map((m, i) => (
          <Message
            key={i}
            message={m}
            isLast={i === messages.length - 1}
            streaming={streaming}
          />
        ))}
        {error && (
          <div className="error">
            <span className="mono error__mark">!</span>
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Message({
  message,
  isLast,
  streaming
}: {
  message: ChatMessage;
  isLast: boolean;
  streaming: boolean;
}) {
  const isStreamingThis = streaming && isLast && message.role === "assistant";

  if (message.role === "user") {
    return (
      <div className="msg msg--user">
        <div className="msg__card">
          <span className="msg__role mono">you</span>
          <div className="msg__text">{message.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="msg msg--assistant">
      <div className="msg__head">
        <span className="msg__mark serif">¶</span>
        <span className="msg__role mono">atelier</span>
      </div>
      {message.tools && message.tools.length > 0 && (
        <ToolBadges tools={message.tools} />
      )}
      <div className="msg__text">
        {message.text ? (
          <>
            <Markdown>{message.text}</Markdown>
            {isStreamingThis && (
              <span className="msg__cursor" aria-hidden>
                ▌
              </span>
            )}
          </>
        ) : (
          isStreamingThis && <span className="msg__dim">thinking…</span>
        )}
      </div>
    </div>
  );
}

const TOOL_ICONS: Record<string, string> = {
  TavilySearchPost: "🔍",
  TavilySearchExtract: "📄",
  add_numbers: "🧮",
  stock_quote: "📈",
  stock_history: "📊",
  stock_compare: "⚖️",
  financial_news: "📰",
  stock_analysis: "🏦",
  options_chain: "🎯",
};

function toolLabel(name: string): string {
  const short = name.includes("___") ? name.split("___")[1] : name;
  return short.replace(/([A-Z])/g, " $1").trim();
}

function ToolBadges({ tools }: { tools: ToolUse[] }) {
  return (
    <div className="msg__tools">
      {tools.map((t) => (
        <span key={t.name} className="tool-badge">
          <span className="tool-badge__icon">
            {TOOL_ICONS[toolLabel(t.name).replace(/\s/g, "")] ??
              TOOL_ICONS[t.name.includes("___") ? t.name.split("___")[1] : t.name] ??
              "⚡"}
          </span>
          <span className="tool-badge__name mono">{toolLabel(t.name)}</span>
        </span>
      ))}
    </div>
  );
}
