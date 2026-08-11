import React, { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, RoutePreview, ToolUse } from "../lib/types";
import { RoutePreviewCard } from "./RoutePreviewCard";

// Tables must scroll inside their own box — a wide quote table should never
// force the whole transcript to scroll sideways.
const MD_COMPONENTS = {
  table: (props: React.ComponentPropsWithoutRef<"table">) => (
    <div className="md-table">
      <table {...props} />
    </div>
  ),
  a: (props: React.ComponentPropsWithoutRef<"a">) => (
    <a {...props} target="_blank" rel="noreferrer noopener" />
  )
};

const SUGGESTIONS = [
  "What's on my calendar today?",
  "Route to my next meeting",
  "How did NVDA close today?",
  "Search the news on AI chips"
];

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  empty: boolean;
  swapping?: boolean;
  onSetReminder?: (preview: RoutePreview) => void;
  onSuggest?: (text: string) => void;
}

export function MessageList({
  messages,
  streaming,
  error,
  empty,
  swapping,
  onSetReminder,
  onSuggest
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Ref drives the scroll effect (no re-render per scroll event); the state
  // mirror drives the pill, and only updates when the value actually flips.
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);

  // Once the user scrolls up mid-stream, stop yanking them back down.
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

  // A transcript swap always lands at the bottom, whatever the reading
  // position was in the conversation we just left.
  useEffect(() => {
    if (!swapping) return;
    pinnedRef.current = true;
    setPinned(true);
  }, [swapping]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    // Smooth scrolling restarts its own animation on every token, which
    // reads as jitter. Stick instantly while streaming, glide otherwise.
    el.scrollTo({
      top: el.scrollHeight,
      behavior: streaming ? "auto" : "smooth"
    });
  }, [messages, streaming]);

  if (empty && messages.length === 0) {
    return (
      <div className="messages-region">
        <div className="messages messages--empty" ref={scrollRef}>
          <div className="empty">
            <span className="mark empty__mark" aria-hidden>
              ◆
            </span>
            <h2 className="empty__title">What can I help with?</h2>
            <p className="empty__hint">
              Ask anything, or start with one of these.
            </p>
            <div className="empty__suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="empty__suggestion"
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
        <div className="messages__inner" data-swapping={swapping ? "true" : "false"}>
          {messages.map((m, i) => (
            <Message
              key={i}
              message={m}
              isLast={i === messages.length - 1}
              streaming={streaming}
              onSetReminder={onSetReminder}
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
      <button
        className="jump-latest"
        data-hidden={pinned || messages.length === 0 ? "true" : "false"}
        onClick={jumpToLatest}
        tabIndex={pinned ? -1 : 0}
        aria-hidden={pinned}
      >
        <span aria-hidden>↓</span>
        <span>Jump to latest</span>
      </button>
    </div>
  );
}

function Message({
  message,
  isLast,
  streaming,
  onSetReminder
}: {
  message: ChatMessage;
  isLast: boolean;
  streaming: boolean;
  onSetReminder?: (preview: RoutePreview) => void;
}) {
  const isStreamingThis = streaming && isLast && message.role === "assistant";

  if (message.role === "user") {
    return (
      <div className="msg msg--user">
        <div className="msg__card">
          <div className="msg__text">{message.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="msg msg--assistant" data-streaming={isStreamingThis}>
      <div className="msg__head">
        <span className="mark" aria-hidden>
          ◆
        </span>
        <span className="msg__role">atelier</span>
      </div>
      {message.tools && message.tools.length > 0 && (
        <ToolBadges tools={message.tools} />
      )}
      {message.routePreviews && message.routePreviews.length > 0 && (
        <div className="msg__route-previews">
          {message.routePreviews.map((preview, idx) => (
            <RoutePreviewCard
              key={`${preview.destinationLabel}-${idx}`}
              preview={preview}
              onSetReminder={onSetReminder}
            />
          ))}
        </div>
      )}
      {/* Keyed so the Thinking→answer handover remounts and blurs in,
          rather than swapping in a single frame. */}
      <div className="msg__text">
        {message.text ? (
          <div key="body" className="msg__phase">
            <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {message.text}
            </Markdown>
          </div>
        ) : (
          isStreamingThis && (
            <div key="thinking" className="msg__phase msg__dim">
              Thinking…
            </div>
          )
        )}
      </div>
    </div>
  );
}

const TOOL_ICONS: Record<string, string> = {
  TavilySearchPost: "/tool-icons/tavily-search.png",
  TavilySearchExtract: "/tool-icons/tavily.png",
  add_numbers: "/tool-icons/calculator.svg",
  stock_quote: "/tool-icons/financial.svg",
  stock_history: "/tool-icons/financial.svg",
  stock_compare: "/tool-icons/financial.svg",
  financial_news: "/tool-icons/financial-news.svg",
  stock_analysis: "/tool-icons/financial.svg",
  options_chain: "/tool-icons/financial.svg",
  github_list_repos: "/tool-icons/github.svg",
  github_get_repo: "/tool-icons/github.svg",
  github_list_issues: "/tool-icons/github.svg",
  google_calendar_list_events: "/tool-icons/google-calendar.svg",
  google_calendar_find_events_with_location: "/tool-icons/google-calendar.svg",
  google_calendar_set_event_reminder: "/tool-icons/google-calendar.svg",
  google_calendar_today: "/tool-icons/google-calendar.svg",
  google_maps_geocode: "/tool-icons/workspace.svg",
  google_maps_place_search: "/tool-icons/workspace.svg",
  google_maps_compute_route: "/tool-icons/workspace.svg",
  google_maps_route_preview: "/tool-icons/workspace.svg",
  notion_search: "/tool-icons/notion.svg",
  notion_get_page: "/tool-icons/notion.svg",
};

function getToolIcon(name: string): string {
  const short = name.includes("___") ? name.split("___")[1] : name;
  return TOOL_ICONS[short] ?? TOOL_ICONS[name] ?? "/tool-icons/workspace.svg";
}

function toolLabel(name: string): string {
  const short = name.includes("___") ? name.split("___")[1] : name;
  return short.replace(/([A-Z])/g, " $1").trim();
}

function ToolBadges({ tools }: { tools: ToolUse[] }) {
  return (
    <div className="msg__tools">
      {tools.map((t) => (
        <span key={t.name} className="tool-badge">
          <img
            className="tool-badge__icon"
            src={getToolIcon(t.name)}
            alt=""
            width={16}
            height={16}
          />
          <span className="tool-badge__name mono">{toolLabel(t.name)}</span>
        </span>
      ))}
    </div>
  );
}
