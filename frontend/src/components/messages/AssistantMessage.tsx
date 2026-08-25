import React, { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractStockQuotes, extractDocumentArtifacts } from "../../lib/format";
import type {
  ArtifactItem,
  ChatMessage,
  DocumentArtifact,
  RoutePreview,
  SubAgentTask,
  TraceInfo
} from "../../lib/types";
import { CodeInterpreterCard } from "../CodeInterpreterCard";
import { DocumentCard } from "../DocumentCard";
import { FinancialChartCard } from "../FinancialChartCard";
import { MermaidDiagram } from "../MermaidDiagram";
import { RoutePreviewCard } from "../RoutePreviewCard";
import { CodeBlockRenderer } from "./CodeBlockRenderer";
import { GeneratingCard } from "./GeneratingCard";
import { ToolBadges } from "./ToolBadges";

interface AssistantMessageProps {
  message: ChatMessage;
  isStreamingThis: boolean;
  onSetReminder?: (preview: RoutePreview) => void;
  onOpenArtifact?: (artifact: ArtifactItem) => void;
  onOpenTrace?: (trace: TraceInfo) => void;
  onOpenSubAgent?: (task: SubAgentTask) => void;
}

export function AssistantMessage({
  message,
  isStreamingThis,
  onSetReminder,
  onOpenArtifact,
  onOpenTrace,
  onOpenSubAgent
}: AssistantMessageProps) {
  // Strip code interpreter block from markdown text and extract document artifacts
  const { cleanText, extractedDocs } = useMemo(() => {
    if (!message.text) return { cleanText: "", extractedDocs: [] };
    const stripped = message.text
      .replace(/```(?:python)?\s*# Python execution sandbox active[\s\S]*?```/gi, "")
      .trim();
    return extractDocumentArtifacts(stripped);
  }, [message.text]);

  const allDocs = useMemo(() => {
    const combined: DocumentArtifact[] = [...(message.documents || [])];
    for (const d of extractedDocs) {
      if (!combined.some((c) => c.filename === d.filename)) {
        combined.push(d);
      }
    }
    const seen = new Set<string>();
    return combined.filter((d) => {
      if (!d.filename || seen.has(d.filename)) return false;
      seen.add(d.filename);
      return true;
    });
  }, [message.documents, extractedDocs]);

  // Detect stock quote cards from text
  const stockQuotes = useMemo(() => {
    if (!cleanText) return [];
    return extractStockQuotes(cleanText);
  }, [cleanText]);

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
          return <MermaidDiagram chart={codeText} onOpenArtifact={onOpenArtifact} />;
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
          {isGeneratingPPT && <GeneratingCard type="powerpoint" />}
          {isGeneratingWord && <GeneratingCard type="word" />}
          {isGeneratingExcel && <GeneratingCard type="excel" />}
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
