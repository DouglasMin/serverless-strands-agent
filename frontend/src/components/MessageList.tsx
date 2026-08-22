import React, { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractStockQuotes, extractDocumentArtifacts } from "../lib/format";
import type { ArtifactItem, ChatMessage, RoutePreview, ToolUse } from "../lib/types";
import { CodeInterpreterCard } from "./CodeInterpreterCard";
import { DocumentCard } from "./DocumentCard";
import { FinancialChartCard } from "./FinancialChartCard";
import { MermaidDiagram } from "./MermaidDiagram";
import { RoutePreviewCard } from "./RoutePreviewCard";

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
  empty: boolean;
  swapping?: boolean;
  onSetReminder?: (preview: RoutePreview) => void;
  onSuggest?: (text: string) => void;
  onOpenArtifact?: (artifact: ArtifactItem) => void;
}

export function MessageList({
  messages,
  streaming,
  error,
  empty,
  swapping,
  onSetReminder,
  onSuggest,
  onOpenArtifact
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
              onOpenArtifact={onOpenArtifact}
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

function CodeBlockRenderer({
  lang,
  codeText,
  className,
  onOpenArtifact,
  children
}: {
  lang: string;
  codeText: string;
  className?: string;
  onOpenArtifact?: (artifact: ArtifactItem) => void;
  children: React.ReactNode;
}) {
  const isHtml =
    lang === "html" ||
    codeText.includes("<!DOCTYPE html>") ||
    codeText.includes("<html") ||
    codeText.includes("<canvas id=");

  const [mode, setMode] = useState<"preview" | "code">(isHtml ? "preview" : "code");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
    }
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header mono">
        <div className="code-block-header__left">
          <span className="code-block-lang">
            {isHtml ? "⚡ interactive html" : lang || "code"}
          </span>
          {isHtml && (
            <div className="code-block-tabs">
              <button
                type="button"
                className={`code-block-tab ${mode === "preview" ? "is-active" : ""}`}
                onClick={() => setMode("preview")}
              >
                live preview
              </button>
              <button
                type="button"
                className={`code-block-tab ${mode === "code" ? "is-active" : ""}`}
                onClick={() => setMode("code")}
              >
                source
              </button>
            </div>
          )}
        </div>

        <div className="code-block-header__actions">
          <button
            type="button"
            className="code-block-btn"
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? "copied" : "copy"}
          </button>
          {onOpenArtifact && (
            <button
              type="button"
              className="code-block-canvas-btn"
              onClick={() =>
                onOpenArtifact({
                  id: String(Date.now()),
                  title: isHtml ? "Interactive Dashboard" : `${lang ? lang.toUpperCase() : "Code"} Snippet`,
                  language: lang || (isHtml ? "html" : "text"),
                  type: isHtml ? "html" : lang === "markdown" ? "markdown" : "code",
                  content: codeText
                })
              }
            >
              open in canvas ↗
            </button>
          )}
        </div>
      </div>

      {isHtml && mode === "preview" ? (
        <div className="code-block-preview">
          <iframe
            className="code-block-iframe"
            srcDoc={codeText}
            title="Interactive Preview"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      ) : (
        <code className={className}>{children}</code>
      )}
    </div>
  );
}

function Message({
  message,
  isLast,
  streaming,
  onSetReminder,
  onOpenArtifact
}: {
  message: ChatMessage;
  isLast: boolean;
  streaming: boolean;
  onSetReminder?: (preview: RoutePreview) => void;
  onOpenArtifact?: (artifact: ArtifactItem) => void;
}) {
  const isStreamingThis = streaming && isLast && message.role === "assistant";

  const { cleanText, extractedDocs } = useMemo(() => {
    return extractDocumentArtifacts(message.text);
  }, [message.text]);

  const allDocs = useMemo(() => {
    const combined = [...(message.documents ?? []), ...extractedDocs];
    const seen = new Set<string>();
    return combined.filter((d) => {
      if (seen.has(d.filename)) return false;
      seen.add(d.filename);
      return true;
    });
  }, [message.documents, extractedDocs]);

  // Detect stock quote cards from text
  const stockQuotes = useMemo(() => {
    if (message.role !== "assistant" || !cleanText) return [];
    return extractStockQuotes(cleanText);
  }, [message.role, cleanText]);

  const mdComponents = useMemo(() => {
    return {
      table: (props: React.ComponentPropsWithoutRef<"table">) => (
        <div className="md-table">
          <table {...props} />
        </div>
      ),
      a: (props: React.ComponentPropsWithoutRef<"a">) => (
        <a {...props} target="_blank" rel="noreferrer noopener" />
      ),
      code: ({ className, children }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) => {
        const match = /language-(\w+)/.exec(className || "");
        const lang = match ? match[1] : "";
        const codeText = String(children).replace(/\n$/, "");

        // Mermaid diagrams
        if (lang === "mermaid") {
          return <MermaidDiagram chart={codeText} />;
        }

        // Multi-line code or language-tagged blocks
        if (codeText.includes("\n") || lang) {
          return (
            <CodeBlockRenderer
              lang={lang}
              codeText={codeText}
              className={className}
              onOpenArtifact={onOpenArtifact}
            >
              {children}
            </CodeBlockRenderer>
          );
        }

        return <code className={className}>{children}</code>;
      }
    };
  }, [onOpenArtifact]);

  if (message.role === "user") {
    return (
      <div className="msg msg--user">
        <div className="msg__card">
          <div className="msg__text">{message.text}</div>
        </div>
      </div>
    );
  }

  const hasCodeInterpreter = message.tools?.some((t) => t.name === "code_interpreter");

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

      {/* Embedded Route Previews */}
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

      {/* Embedded Financial Charts */}
      {stockQuotes.length > 0 && (
        <div className="msg__financial-charts">
          {stockQuotes.map((quote) => (
            <FinancialChartCard key={quote.symbol} data={quote} />
          ))}
        </div>
      )}

      {/* Embedded Office Documents (Word, Excel, PowerPoint) */}
      {allDocs.length > 0 && (
        <div className="msg__documents">
          {allDocs.map((doc, idx) => (
            <DocumentCard
              key={`${doc.filename}-${idx}`}
              document={doc}
              onOpenCanvas={onOpenArtifact}
            />
          ))}
        </div>
      )}

      {/* Code Interpreter Execution Card when tool used */}
      {hasCodeInterpreter && !isStreamingThis && (
        <div className="msg__code-interpreters">
          <CodeInterpreterCard
            code="# Python execution sandbox active"
            status="success"
            executionTimeMs={180}
            onOpenInCanvas={
              onOpenArtifact
                ? () =>
                    onOpenArtifact({
                      id: String(Date.now()),
                      title: "Python Sandbox Execution",
                      language: "python",
                      type: "code",
                      content: cleanText
                    })
                : undefined
            }
          />
        </div>
      )}

      <div className="msg__text">
        {cleanText ? (
          <div key="body" className="msg__phase">
            <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {cleanText}
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
  create_excel_spreadsheet: "/tool-icons/excel.svg",
  create_word_document: "/tool-icons/word.svg",
  create_powerpoint_presentation: "/tool-icons/powerpoint.svg",
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
  code_interpreter: "/tool-icons/code-interpreter.svg",
};

function getToolIcon(name: string): string {
  const short = name.includes("___") ? name.split("___")[1] : name;
  if (short.startsWith("github_")) return "/tool-icons/github.svg";
  if (short.startsWith("notion_")) return "/tool-icons/notion.svg";
  if (short.startsWith("google_calendar_")) return "/tool-icons/google-calendar.svg";
  if (short.startsWith("google_maps_")) return "/tool-icons/google-maps.svg";
  if (short.includes("excel")) return "/tool-icons/excel.svg";
  if (short.includes("word")) return "/tool-icons/word.svg";
  if (short.includes("powerpoint") || short.includes("pptx")) return "/tool-icons/powerpoint.svg";
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
