import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactItem } from "../lib/types";

interface Props {
  artifact: ArtifactItem | null;
  onClose: () => void;
}

export function ArtifactCanvas({ artifact, onClose }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");

  if (!artifact) return null;

  const isHtml =
    artifact.type === "html" ||
    artifact.language === "html" ||
    artifact.content.includes("<!DOCTYPE html>") ||
    artifact.content.includes("<html");

  const isMarkdown = artifact.type === "markdown" || artifact.language === "markdown";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
    }
  };

  const handleDownload = () => {
    const ext =
      isHtml
        ? "html"
        : artifact.language === "python"
          ? "py"
          : artifact.language === "javascript"
            ? "js"
            : artifact.language === "typescript"
              ? "ts"
              : isMarkdown
                ? "md"
                : "txt";

    const blob = new Blob([artifact.content], {
      type: isHtml ? "text/html;charset=utf-8" : "text/plain;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "artifact"}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <aside className={`artifact-canvas ${fullscreen ? "is-fullscreen" : ""}`}>
      <div className="artifact-canvas__header">
        <div className="artifact-canvas__title-group">
          <span className="mark artifact-canvas__mark" aria-hidden>
            ◆
          </span>
          <div className="artifact-canvas__titles">
            <span className="artifact-canvas__badge mono">
              {isHtml ? "HTML Dashboard" : artifact.language || artifact.type}
            </span>
            <h3 className="artifact-canvas__title">{artifact.title}</h3>
          </div>
        </div>

        <div className="artifact-canvas__actions">
          {(isMarkdown || isHtml) && (
            <div className="artifact-canvas__modes">
              <button
                type="button"
                className={`artifact-canvas__mode-btn mono ${viewMode === "preview" ? "is-active" : ""}`}
                onClick={() => setViewMode("preview")}
              >
                preview
              </button>
              <button
                type="button"
                className={`artifact-canvas__mode-btn mono ${viewMode === "code" ? "is-active" : ""}`}
                onClick={() => setViewMode("code")}
              >
                source
              </button>
            </div>
          )}

          <button
            type="button"
            className="artifact-canvas__btn mono"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? "copied" : "copy"}
          </button>

          <button
            type="button"
            className="artifact-canvas__btn mono"
            onClick={handleDownload}
            title="Download file"
          >
            download
          </button>

          <button
            type="button"
            className="artifact-canvas__btn mono"
            onClick={() => setFullscreen(!fullscreen)}
            title={fullscreen ? "Restore side view" : "Full screen"}
          >
            {fullscreen ? "restore" : "expand"}
          </button>

          <button
            type="button"
            className="artifact-canvas__close-btn mono"
            onClick={onClose}
            aria-label="Close canvas"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="artifact-canvas__content">
        {isHtml && viewMode === "preview" ? (
          <iframe
            className="artifact-canvas__iframe"
            srcDoc={artifact.content}
            title={artifact.title}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        ) : isMarkdown && viewMode === "preview" ? (
          <div className="artifact-canvas__markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{artifact.content}</Markdown>
          </div>
        ) : (
          <pre className="artifact-canvas__code mono">
            <code>{artifact.content}</code>
          </pre>
        )}
      </div>
    </aside>
  );
}
