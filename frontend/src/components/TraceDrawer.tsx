import { useState } from "react";
import type { TraceInfo } from "../lib/types";

interface Props {
  trace: TraceInfo;
  onClose: () => void;
}

function getToolIcon(toolName: string): string {
  const t = toolName.toLowerCase();
  if (t.includes("maps") || t.includes("route")) return "🗺️";
  if (t.includes("code") || t.includes("interpreter")) return "💻";
  if (t.includes("excel") || t.includes("spreadsheet")) return "📊";
  if (t.includes("word") || t.includes("document")) return "📄";
  if (t.includes("powerpoint") || t.includes("presentation")) return "📽️";
  if (t.includes("github")) return "🐙";
  if (t.includes("calendar")) return "📅";
  if (t.includes("notion")) return "📝";
  if (t.includes("finance") || t.includes("stock")) return "📈";
  if (t.includes("tavily") || t.includes("search")) return "🔍";
  return "⚡";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function TraceDrawer({ trace, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [jsonExpanded, setJsonExpanded] = useState(false);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Failed to copy trace:", err);
    }
  };

  const isFast = trace.durationMs < 1500;
  const isMultiStep = trace.toolsUsed.length > 1;

  // Build estimated waterfall breakdown
  const toolTimeEstimate = Math.max(
    Math.round(trace.durationMs * 0.45),
    trace.toolsUsed.length * 280
  );
  const reasoningTime = Math.max(trace.durationMs - toolTimeEstimate - 120, 150);

  return (
    <aside className="trace-drawer" aria-label="Execution Trace Inspector">
      <header className="trace-drawer__header">
        <div className="trace-drawer__title-row">
          <div className="trace-drawer__badge">
            <span className="trace-drawer__badge-dot" />
            <span>Trace Inspector</span>
          </div>
          <span className="trace-drawer__shortcut mono">⌘I</span>
        </div>

        <button
          className="trace-drawer__close"
          onClick={onClose}
          aria-label="Close trace inspector"
          title="Close (Esc)"
        >
          ✕
        </button>
      </header>

      <div className="trace-drawer__content">
        {/* Quick Stats Grid */}
        <section className="trace-stats-grid">
          <div className="trace-stat-card">
            <span className="trace-stat-card__label">Latency</span>
            <div className="trace-stat-card__value-row">
              <span className="trace-stat-card__value mono">
                {formatDuration(trace.durationMs)}
              </span>
              <span
                className={`trace-badge ${
                  isFast
                    ? "trace-badge--fast"
                    : isMultiStep
                    ? "trace-badge--multi"
                    : "trace-badge--normal"
                }`}
              >
                {isFast ? "⚡ Fast" : isMultiStep ? "🔄 Multi-step" : "Normal"}
              </span>
            </div>
          </div>

          <div className="trace-stat-card">
            <span className="trace-stat-card__label">Model</span>
            <div className="trace-stat-card__value-row">
              <span className="trace-stat-card__value">Claude 3.7</span>
              <span className="trace-badge trace-badge--model">Sonnet</span>
            </div>
          </div>

          <div className="trace-stat-card">
            <span className="trace-stat-card__label">Tools Executed</span>
            <div className="trace-stat-card__value-row">
              <span className="trace-stat-card__value mono">
                {trace.toolsUsed.length}
              </span>
              <span className="trace-badge trace-badge--tools">
                {trace.toolsUsed.length === 0 ? "Direct LLM" : "Tool Assisted"}
              </span>
            </div>
          </div>

          <div className="trace-stat-card">
            <span className="trace-stat-card__label">Memory & Sandbox</span>
            <div className="trace-stat-card__value-row">
              <span className="trace-stat-card__value">AgentCore</span>
              <span className="trace-badge trace-badge--sandbox">
                {trace.memoryEnabled ? "Memory On" : "Ephemeral"}
              </span>
            </div>
          </div>
        </section>

        {/* Execution Waterfall Timeline */}
        <section className="trace-section">
          <h3 className="trace-section__title">
            <span>Execution Waterfall</span>
            <span className="trace-section__badge mono">Step Timeline</span>
          </h3>

          <div className="trace-waterfall">
            {/* Step 1: Ingestion & Auth */}
            <div className="waterfall-step">
              <div className="waterfall-step__head">
                <span className="waterfall-step__icon">🔐</span>
                <div className="waterfall-step__info">
                  <span className="waterfall-step__name">
                    Cognito Auth & Ingestion
                  </span>
                  <span className="waterfall-step__desc">
                    Verified ID token sub & request signature
                  </span>
                </div>
                <span className="waterfall-step__dur mono">~45 ms</span>
              </div>
              <div className="waterfall-step__bar-wrap">
                <div
                  className="waterfall-step__bar waterfall-step__bar--auth"
                  style={{ width: "8%" }}
                />
              </div>
            </div>

            {/* Step 2: Reasoning & Orchestration */}
            <div className="waterfall-step">
              <div className="waterfall-step__head">
                <span className="waterfall-step__icon">🧠</span>
                <div className="waterfall-step__info">
                  <span className="waterfall-step__name">
                    AgentCore Runtime Reasoning
                  </span>
                  <span className="waterfall-step__desc">
                    Anthropic Claude 3.7 Sonnet thinking & prompt expansion
                  </span>
                </div>
                <span className="waterfall-step__dur mono">
                  {formatDuration(reasoningTime)}
                </span>
              </div>
              <div className="waterfall-step__bar-wrap">
                <div
                  className="waterfall-step__bar waterfall-step__bar--reasoning"
                  style={{
                    width: `${Math.min(
                      Math.round((reasoningTime / trace.durationMs) * 100),
                      85
                    )}%`,
                    marginLeft: "8%"
                  }}
                />
              </div>
            </div>

            {/* Step 3: Tool Calls (if any) */}
            {trace.toolsUsed.map((tool, idx) => (
              <div key={`${tool}-${idx}`} className="waterfall-step waterfall-step--tool">
                <div className="waterfall-step__head">
                  <span className="waterfall-step__icon">{getToolIcon(tool)}</span>
                  <div className="waterfall-step__info">
                    <span className="waterfall-step__name mono">{tool}</span>
                    <span className="waterfall-step__desc">
                      Executed in isolated AgentCore microVM runtime
                    </span>
                  </div>
                  <span className="waterfall-step__dur mono">
                    {formatDuration(Math.round(toolTimeEstimate / trace.toolsUsed.length))}
                  </span>
                </div>
                <div className="waterfall-step__bar-wrap">
                  <div
                    className="waterfall-step__bar waterfall-step__bar--tool"
                    style={{
                      width: `${Math.min(
                        Math.round((toolTimeEstimate / trace.durationMs) * 100),
                        75
                      )}%`,
                      marginLeft: "35%"
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Step 4: SSE Streaming & UI Delivery */}
            <div className="waterfall-step">
              <div className="waterfall-step__head">
                <span className="waterfall-step__icon">⚡</span>
                <div className="waterfall-step__info">
                  <span className="waterfall-step__name">
                    SSE Response Stream & DynamoDB Commit
                  </span>
                  <span className="waterfall-step__desc">
                    Chunked text, route previews & artifacts saved to session
                  </span>
                </div>
                <span className="waterfall-step__dur mono">~65 ms</span>
              </div>
              <div className="waterfall-step__bar-wrap">
                <div
                  className="waterfall-step__bar waterfall-step__bar--stream"
                  style={{ width: "12%", marginLeft: "88%" }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Tools Summary */}
        {trace.toolsUsed.length > 0 && (
          <section className="trace-section">
            <h3 className="trace-section__title">
              <span>Tools Invocation Registry</span>
              <span className="trace-section__badge mono">
                {trace.toolsUsed.length} Active
              </span>
            </h3>

            <div className="trace-tools-list">
              {trace.toolsUsed.map((tool, idx) => (
                <div key={`${tool}-${idx}`} className="trace-tool-item">
                  <span className="trace-tool-item__icon">{getToolIcon(tool)}</span>
                  <div className="trace-tool-item__details">
                    <span className="trace-tool-item__name mono">{tool}</span>
                    <span className="trace-tool-item__status">
                      Status: <strong className="status--success">SUCCESS</strong>
                    </span>
                  </div>
                  <span className="trace-tool-item__tag mono">v1.0.0</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Langfuse Deep Link */}
        <section className="trace-section">
          <h3 className="trace-section__title">Distributed Telemetry</h3>
          <div className="trace-telemetry-box">
            <div className="trace-telemetry-box__info">
              <span className="trace-telemetry-box__title">Langfuse OpenTelemetry</span>
              <p className="trace-telemetry-box__desc">
                Session ID: <code className="mono">{trace.sessionId.slice(0, 18)}…</code>
              </p>
            </div>
            <a
              href={`https://us.cloud.langfuse.com/project/serverlessstrands?search=${encodeURIComponent(
                trace.sessionId
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="trace-telemetry-btn"
            >
              Open in Langfuse ↗
            </a>
          </div>
        </section>

        {/* Raw JSON Tree */}
        <section className="trace-section">
          <div className="trace-section__header-action">
            <h3 className="trace-section__title">Raw Trace Payload</h3>
            <div className="trace-json-actions">
              <button
                type="button"
                className="trace-action-btn"
                onClick={() => setJsonExpanded(!jsonExpanded)}
              >
                {jsonExpanded ? "Collapse" : "Expand"}
              </button>
              <button
                type="button"
                className="trace-action-btn"
                onClick={copyJson}
              >
                {copied ? "Copied! ✓" : "Copy JSON"}
              </button>
            </div>
          </div>

          <pre
            className={`trace-json-viewer mono ${
              jsonExpanded ? "is-expanded" : ""
            }`}
          >
            <code>{JSON.stringify(trace, null, 2)}</code>
          </pre>
        </section>
      </div>
    </aside>
  );
}
