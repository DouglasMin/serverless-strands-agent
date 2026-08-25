import { useState, useEffect } from "react";
import type { ArtifactItem, SubAgentTask, TraceInfo } from "../../lib/types";
import { PowerPointViewer } from "./PowerPointViewer";
import { ExcelViewer } from "./ExcelViewer";
import { WordViewer } from "./WordViewer";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MermaidDiagram } from "../MermaidDiagram";

export type StudioTab = "deliverable" | "research" | "trace";

interface StudioDrawerProps {
  artifact: ArtifactItem | null;
  subagentTask: SubAgentTask | null;
  trace: TraceInfo | null;
  initialTab?: StudioTab;
  onClose: () => void;
}

export function StudioDrawer({
  artifact,
  subagentTask,
  trace,
  initialTab,
  onClose
}: StudioDrawerProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>(initialTab || "deliverable");
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Sync active tab when inputs change
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    } else if (artifact) {
      setActiveTab("deliverable");
    } else if (subagentTask) {
      setActiveTab("research");
    } else if (trace) {
      setActiveTab("trace");
    }
  }, [artifact, subagentTask, trace, initialTab]);

  const doc = artifact?.document;
  const filename = doc?.filename || artifact?.title || "deliverable";
  const fileType = String(doc?.fileType || doc?.file_type || doc?.type || "").toLowerCase();
  const downloadUrl = String(doc?.url || doc?.dataUri || doc?.data_uri || doc?.s3Uri || "");

  const isPowerPoint = fileType.includes("powerpoint") || fileType.includes("pptx") || filename.endsWith(".pptx");
  const isExcel = fileType.includes("excel") || fileType.includes("xlsx") || fileType.includes("spreadsheet") || filename.endsWith(".xlsx");
  const isWord = fileType.includes("word") || fileType.includes("docx") || filename.endsWith(".docx");

  const handleCopy = () => {
    if (!artifact?.content) return;
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const link = window.document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
    } else if (artifact?.content) {
      const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = filename.includes(".") ? filename : `${filename}.${artifact.language || "txt"}`;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <aside className={`studio-drawer ${isExpanded ? "studio-drawer--expanded" : ""}`}>
      {/* Studio Header Bar */}
      <div className="studio-drawer__header">
        {/* Tab Switcher */}
        <div className="studio-drawer__tabs">
          {artifact && (
            <button
              type="button"
              className={`studio-tab ${activeTab === "deliverable" ? "studio-tab--active" : ""}`}
              onClick={() => setActiveTab("deliverable")}
            >
              <span className="studio-tab__icon">
                {isPowerPoint ? "🎯" : isExcel ? "📊" : isWord ? "📑" : "📄"}
              </span>
              <span className="studio-tab__label mono">{filename}</span>
            </button>
          )}

          {subagentTask && (
            <button
              type="button"
              className={`studio-tab ${activeTab === "research" ? "studio-tab--active" : ""}`}
              onClick={() => setActiveTab("research")}
            >
              <span className="studio-tab__icon">🔬</span>
              <span className="studio-tab__label mono">Research Live</span>
            </button>
          )}

          {trace && (
            <button
              type="button"
              className={`studio-tab ${activeTab === "trace" ? "studio-tab--active" : ""}`}
              onClick={() => setActiveTab("trace")}
            >
              <span className="studio-tab__icon">⚡</span>
              <span className="studio-tab__label mono">Telemetry</span>
            </button>
          )}
        </div>

        {/* Header Action Buttons */}
        <div className="studio-drawer__actions">
          {/* Direct Download Button */}
          {(downloadUrl || (artifact && artifact.content)) && (
            <button
              type="button"
              className="studio-btn studio-btn--primary mono"
              onClick={handleDownload}
              title="Download file directly from S3 (24h presigned)"
            >
              <span>Download</span>
              <span className="studio-btn__arrow">↓</span>
            </button>
          )}

          {artifact && artifact.type === "code" && (
            <button
              type="button"
              className="studio-btn mono"
              onClick={handleCopy}
              title="Copy code to clipboard"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          )}

          <button
            type="button"
            className="studio-btn studio-btn--icon mono"
            onClick={() => setIsExpanded((e) => !e)}
            title={isExpanded ? "Collapse panel width" : "Expand panel width"}
          >
            {isExpanded ? "⊡" : "⊞"}
          </button>

          <button
            type="button"
            className="studio-btn studio-btn--icon"
            onClick={onClose}
            title="Close Workspace Studio (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Studio Content Body */}
      <div className="studio-drawer__body">
        {activeTab === "deliverable" && artifact && (
          <div className="studio-deliverable-view">
            {isPowerPoint && doc ? (
              <PowerPointViewer document={doc} />
            ) : isExcel && doc ? (
              <ExcelViewer document={doc} />
            ) : isWord && doc ? (
              <WordViewer document={doc} />
            ) : artifact.type === "html" ? (
              <iframe
                title={artifact.title}
                srcDoc={artifact.content}
                className="studio-iframe"
                sandbox="allow-scripts"
              />
            ) : artifact.type === "markdown" ? (
              <div className="studio-markdown-paper">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code: ({ className, children }: any) => {
                      const match = /language-(\w+)/.exec(className || "");
                      const lang = match ? match[1] : "";
                      const codeText = String(children).replace(/\n$/, "");
                      if (lang === "mermaid") {
                        return <MermaidDiagram chart={codeText} />;
                      }
                      return <code className={className}>{children}</code>;
                    }
                  }}
                >
                  {artifact.content}
                </Markdown>
              </div>
            ) : (
              <div className="studio-code-view">
                <pre className="mono">
                  <code>{artifact.content}</code>
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === "research" && subagentTask && (
          <div className="studio-research-view">
            <div className="subagent-canvas__top">
              <div className="subagent-canvas__title-row">
                <span className="subagent-canvas__status-dot" />
                <h3 className="subagent-canvas__mission-title">{subagentTask.topic}</h3>
              </div>
              <div className="subagent-canvas__meta mono">
                <span>Agent: {subagentTask.agentName}</span>
                <span>•</span>
                <span>Status: {subagentTask.status}</span>
              </div>
            </div>

            <div className="subagent-canvas__section">
              <h4 className="subagent-canvas__section-title mono">EXECUTION TRACE</h4>
              <div className="subagent-canvas__steps">
                {subagentTask.steps.map((s, i) => (
                  <div key={i} className="subagent-step">
                    <div className="subagent-step__time mono">{s.time}</div>
                    <div className="subagent-step__content">
                      <span className="subagent-step__tool mono">[{s.tool}]</span>
                      <span className="subagent-step__detail">{s.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {subagentTask.sources && subagentTask.sources.length > 0 && (
              <div className="subagent-canvas__section">
                <h4 className="subagent-canvas__section-title mono">DISCOVERED SOURCES ({subagentTask.sources.length})</h4>
                <div className="subagent-canvas__sources">
                  {subagentTask.sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="subagent-source-card"
                    >
                      <div className="subagent-source-card__title">{src.title || src.url}</div>
                      {src.snippet && <div className="subagent-source-card__snippet">{src.snippet}</div>}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "trace" && trace && (
          <div className="studio-trace-view">
            <div className="trace-meta-grid">
              <div className="trace-meta-item">
                <span className="trace-meta-label mono">TOTAL DURATION</span>
                <span className="trace-meta-value mono">{trace.durationMs}ms</span>
              </div>
              <div className="trace-meta-item">
                <span className="trace-meta-label mono">MODEL</span>
                <span className="trace-meta-value mono">{trace.model}</span>
              </div>
              <div className="trace-meta-item">
                <span className="trace-meta-label mono">TOOLS CALLED</span>
                <span className="trace-meta-value mono">{trace.toolsUsed.length}</span>
              </div>
            </div>

            <div className="trace-tools-list">
              <h4 className="trace-section-title mono">TOOLS WATERFALL</h4>
              {trace.toolsUsed.map((tool, idx) => (
                <div key={idx} className="trace-tool-row mono">
                  <span className="trace-tool-idx">0{idx + 1}</span>
                  <span className="trace-tool-name">{tool}</span>
                  <span className="trace-tool-status">✓ 200 OK</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
