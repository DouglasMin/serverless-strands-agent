import { useState } from "react";

interface Props {
  code: string;
  language?: string;
  output?: string;
  status?: "running" | "success" | "error";
  executionTimeMs?: number;
  onOpenInCanvas?: () => void;
}

export function CodeInterpreterCard({
  code,
  language = "python",
  output,
  status = "success",
  executionTimeMs,
  onOpenInCanvas
}: Props) {
  const [activeTab, setActiveTab] = useState<"code" | "output">("code");
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const textToCopy = activeTab === "code" ? code : output ?? code;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
    }
  };

  return (
    <div className="code-card">
      <div className="code-card__header">
        <div className="code-card__left" onClick={() => setCollapsed(!collapsed)}>
          <span className="code-card__chevron mono" data-collapsed={collapsed}>
            ▾
          </span>
          <span className="code-card__icon mono">⚡</span>
          <span className="code-card__title mono">{language}</span>
          {executionTimeMs !== undefined && (
            <span className="code-card__pill code-card__pill--success mono tnum">
              ✓ {executionTimeMs}ms
            </span>
          )}
          {status === "running" && (
            <span className="code-card__pill code-card__pill--running mono">
              running…
            </span>
          )}
          {status === "error" && (
            <span className="code-card__pill code-card__pill--error mono">
              failed
            </span>
          )}
        </div>

        <div className="code-card__actions">
          {output && !collapsed && (
            <div className="code-card__tabs">
              <button
                type="button"
                className={`code-card__tab mono ${activeTab === "code" ? "is-active" : ""}`}
                onClick={() => setActiveTab("code")}
              >
                code
              </button>
              <button
                type="button"
                className={`code-card__tab mono ${activeTab === "output" ? "is-active" : ""}`}
                onClick={() => setActiveTab("output")}
              >
                output
              </button>
            </div>
          )}

          <button
            type="button"
            className="code-card__action-btn mono"
            onClick={handleCopy}
            title="Copy content"
          >
            {copied ? "copied" : "copy"}
          </button>

          {onOpenInCanvas && (
            <button
              type="button"
              className="code-card__action-btn mono"
              onClick={onOpenInCanvas}
              title="Open side canvas"
            >
              canvas ↗
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="code-card__body">
          {activeTab === "code" ? (
            <pre className="code-card__pre mono">
              <code>{code.trim()}</code>
            </pre>
          ) : (
            <pre className="code-card__pre code-card__pre--output mono">
              <code>{output?.trim() || "(no output)"}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
