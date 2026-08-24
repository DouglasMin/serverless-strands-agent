import React, { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractStockQuotes, extractDocumentArtifacts } from "../lib/format";
import type {
  ArtifactItem,
  ChatMessage,
  RoutePreview,
  SubAgentTask,
  ToolUse,
  TraceInfo
} from "../lib/types";
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
            <span className="subagent-canvas__spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            <p className="empty__hint mono" style={{ marginTop: 16 }}>Loading conversation...</p>
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
              onOpenTrace={onOpenTrace}
              onOpenSubAgent={onOpenSubAgent}
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
  onOpenArtifact,
  onOpenTrace,
  onOpenSubAgent
}: {
  message: ChatMessage;
  isLast: boolean;
  streaming: boolean;
  onSetReminder?: (preview: RoutePreview) => void;
  onOpenArtifact?: (artifact: ArtifactItem) => void;
  onOpenTrace?: (trace: TraceInfo) => void;
  onOpenSubAgent?: (task: SubAgentTask) => void;
}) {
  const isStreamingThis = streaming && isLast && message.role === "assistant";

  const { cleanText, extractedDocs } = useMemo(() => {
    return extractDocumentArtifacts(message.text);
  }, [message.text]);

  const allDocs = useMemo(() => {
    const combined = [...(message.documents ?? []), ...extractedDocs];
    const seen = new Set<string>();
    return combined.filter((d) => {
      if (!d || !d.filename) return false;
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
          {message.attachments && message.attachments.length > 0 && (
            <div className="msg__user-attachments">
              {message.attachments.map((att, idx) => (
                <span key={`${att.filename}-${idx}`} className="user-attachment-chip">
                  📎 {att.filename}
                </span>
              ))}
            </div>
          )}
          <div className="msg__text">{message.text}</div>
        </div>
      </div>
    );
  }

  const hasCodeInterpreter = message.tools?.some((t) => t.name === "code_interpreter");

  // Track active deliverable creation tools during streaming
  const hasPPTTool = message.tools?.some((t) => t.name.includes("powerpoint") || t.name.includes("pptx"));
  const hasWordTool = message.tools?.some((t) => t.name.includes("word") || t.name.includes("docx"));
  const hasExcelTool = message.tools?.some((t) => t.name.includes("excel") || t.name.includes("spreadsheet") || t.name.includes("xlsx"));

  const hasPPTDoc = allDocs.some((d) => {
    const t = String(d.fileType || (d as any).file_type || (d as any).type || d.filename || "").toLowerCase();
    return t.includes("powerpoint") || t.includes("pptx") || t.includes("presentation");
  });
  const hasWordDoc = allDocs.some((d) => {
    const t = String(d.fileType || (d as any).file_type || (d as any).type || d.filename || "").toLowerCase();
    return t.includes("word") || t.includes("docx") || t.includes("doc");
  });
  const hasExcelDoc = allDocs.some((d) => {
    const t = String(d.fileType || (d as any).file_type || (d as any).type || d.filename || "").toLowerCase();
    return t.includes("excel") || t.includes("xlsx") || t.includes("xls") || t.includes("spreadsheet");
  });

  const isGeneratingPPT = isStreamingThis && hasPPTTool && !hasPPTDoc;
  const isGeneratingWord = isStreamingThis && hasWordTool && !hasWordDoc;
  const isGeneratingExcel = isStreamingThis && hasExcelTool && !hasExcelDoc;

  return (
    <div className="msg msg--assistant" data-streaming={isStreamingThis}>
      <div className="msg__head">
        <span className="mark" aria-hidden>
          ◆
        </span>
        <span className="msg__role">atelier</span>
      </div>

      {message.tools && message.tools.length > 0 && (
        <ToolBadges
          tools={message.tools}
          subagentTasks={message.subagentTasks}
          isStreaming={isStreamingThis}
          onOpenSubAgent={onOpenSubAgent}
        />
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
      {(allDocs.length > 0 || isGeneratingPPT || isGeneratingWord || isGeneratingExcel) && (
        <div className="msg__documents">
          {allDocs.map((doc, idx) => (
            <DocumentCard
              key={`${doc.filename}-${idx}`}
              document={doc}
              onOpenCanvas={onOpenArtifact}
            />
          ))}

          {/* Active Generation Progress Cards */}
          {isGeneratingPPT && (
            <div className="document-card document-card--generating document-card--powerpoint">
              <div className="document-card__header">
                <div className="document-card__left">
                  <img
                    src="/tool-icons/powerpoint.svg"
                    alt=""
                    className="document-card__icon document-card__icon--spinning"
                    width={24}
                    height={24}
                  />
                  <div className="document-card__info">
                    <div className="document-card__title-row">
                      <span className="document-card__title">Generating PowerPoint Presentation (.pptx)...</span>
                      <span className="document-card__badge document-card__badge--pulsing">BUILDING SLIDES</span>
                    </div>
                    <div className="document-card__meta">
                      <span className="document-card__summary">Applying widescreen themes, structured layouts & visual cards...</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="document-card__progress-line">
                <div className="document-card__progress-bar-glow" />
              </div>
            </div>
          )}

          {isGeneratingWord && (
            <div className="document-card document-card--generating document-card--word">
              <div className="document-card__header">
                <div className="document-card__left">
                  <img
                    src="/tool-icons/word.svg"
                    alt=""
                    className="document-card__icon document-card__icon--spinning"
                    width={24}
                    height={24}
                  />
                  <div className="document-card__info">
                    <div className="document-card__title-row">
                      <span className="document-card__title">Generating Word Document (.docx)...</span>
                      <span className="document-card__badge document-card__badge--pulsing">FORMATTING REPORT</span>
                    </div>
                    <div className="document-card__meta">
                      <span className="document-card__summary">Structuring executive chapters, benchmarks, styled tables & callouts...</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="document-card__progress-line">
                <div className="document-card__progress-bar-glow" />
              </div>
            </div>
          )}

          {isGeneratingExcel && (
            <div className="document-card document-card--generating document-card--excel">
              <div className="document-card__header">
                <div className="document-card__left">
                  <img
                    src="/tool-icons/excel.svg"
                    alt=""
                    className="document-card__icon document-card__icon--spinning"
                    width={24}
                    height={24}
                  />
                  <div className="document-card__info">
                    <div className="document-card__title-row">
                      <span className="document-card__title">Compiling Excel Spreadsheet (.xlsx)...</span>
                      <span className="document-card__badge document-card__badge--pulsing">CALCULATING DATA</span>
                    </div>
                    <div className="document-card__meta">
                      <span className="document-card__summary">Calculating formulas, formatting sheets & styled header bands...</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="document-card__progress-line">
                <div className="document-card__progress-bar-glow" />
              </div>
            </div>
          )}
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

      {/* Trace Observability Badge */}
      {message.trace && !isStreamingThis && (
        <div className="msg__trace-bar">
          <button
            type="button"
            className="msg-trace-pill"
            onClick={() => onOpenTrace?.(message.trace!)}
            title="Inspect AgentCore execution trace and tool waterfall (⌘I)"
          >
            <span className="msg-trace-pill__icon">⚡</span>
            <span className="msg-trace-pill__time mono">
              {message.trace.durationMs < 1000
                ? `${message.trace.durationMs}ms`
                : `${(message.trace.durationMs / 1000).toFixed(2)}s`}
            </span>
            {message.trace.toolsUsed && message.trace.toolsUsed.length > 0 && (
              <span className="msg-trace-pill__tools">
                · {message.trace.toolsUsed.length}{" "}
                {message.trace.toolsUsed.length === 1 ? "tool" : "tools"}
              </span>
            )}
            <span className="msg-trace-pill__model">· Claude 3.7</span>
            <span className="msg-trace-pill__arrow">↗</span>
          </button>
        </div>
      )}
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
  deep_research: "/tool-icons/research-agent.svg",
};

function getToolIcon(name: string): string {
  const short = name.includes("___") ? name.split("___")[1] : name;
  if (short.includes("deep_research") || short.includes("research")) return "/tool-icons/research-agent.svg";
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
  const map: Record<string, string> = {
    create_powerpoint_presentation: "PowerPoint (.pptx)",
    create_word_document: "Word (.docx)",
    create_excel_spreadsheet: "Excel (.xlsx)",
    deep_research: "Deep Research Agent",
    code_interpreter: "Python Sandbox",
    google_calendar_list_events: "Google Calendar",
    google_calendar_find_events_with_location: "Google Calendar",
    google_calendar_set_event_reminder: "Calendar Reminder",
    google_maps_route_preview: "Google Maps Route",
    google_maps_geocode: "Location Geocode",
    google_maps_place_search: "Place Search",
    notion_search: "Notion Search",
    notion_get_page: "Notion Page",
    github_list_repos: "GitHub Repos",
    github_get_repo: "GitHub Repo",
    github_list_issues: "GitHub Issues",
  };
  if (map[short]) return map[short];
  return short.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim();
}

const INTERNAL_SUBAGENT_TOOLS = new Set([
  "tavily_search",
  "tavily",
  "arxiv_search",
  "wikipedia_search",
  "web_extract"
]);

function ToolBadges({
  tools,
  subagentTasks,
  isStreaming,
  onOpenSubAgent
}: {
  tools: ToolUse[];
  subagentTasks?: SubAgentTask[];
  isStreaming?: boolean;
  onOpenSubAgent?: (task: SubAgentTask) => void;
}) {
  const latestSubAgentTask =
    subagentTasks && subagentTasks.length > 0 ? subagentTasks[subagentTasks.length - 1] : null;

  const visibleTools = tools.filter((t) => !INTERNAL_SUBAGENT_TOOLS.has(t.name.toLowerCase()));

  if (visibleTools.length === 0) return null;

  return (
    <div className="msg__tools">
      {visibleTools.map((t, idx) => {
        const isSubAgent = t.name.includes("deep_research") || t.name.includes("research");
        const isLatest = isStreaming && idx === visibleTools.length - 1;
        return (
          <span key={t.name} className={`tool-badge ${isSubAgent ? "tool-badge--subagent" : ""}`}>
            {isLatest && <span className="tool-badge__pulse" />}
            <img
              className="tool-badge__icon"
              src={getToolIcon(t.name)}
              alt=""
              width={16}
              height={16}
            />
            <span className="tool-badge__name mono">
              {toolLabel(t.name)}
              {isLatest && " • in progress"}
            </span>
            {isSubAgent && onOpenSubAgent && (
              <button
                type="button"
                className="tool-badge__canvas-btn mono"
                onClick={() =>
                  onOpenSubAgent(
                    latestSubAgentTask || {
                      id: `subagent-task-${Date.now()}`,
                      agentName: "DeepResearchAgent",
                      topic: "Autonomous Research Mission",
                      status: "searching",
                      startTime: Date.now(),
                      steps: [
                        {
                          time: new Date().toLocaleTimeString(),
                          tool: "research_agent",
                          detail: "Initializing autonomous search vectors..."
                        }
                      ],
                      sources: []
                    }
                  )
                }
                title="Open Sub-Agent Live Execution Canvas"
              >
                🔬 Live Canvas ↗
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
