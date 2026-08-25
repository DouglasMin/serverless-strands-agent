import React, { useState } from "react";
import type { ArtifactItem } from "../../lib/types";

interface CodeBlockRendererProps {
  lang: string;
  codeText: string;
  className?: string;
  children: React.ReactNode;
  onOpenArtifact?: (artifact: ArtifactItem) => void;
}

export function CodeBlockRenderer({
  lang,
  codeText,
  className,
  children,
  onOpenArtifact
}: CodeBlockRendererProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const linesCount = codeText.split("\n").length;
  const isLong = linesCount > 28;

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenArtifact = () => {
    if (!onOpenArtifact) return;
    const type: "code" | "markdown" | "html" =
      lang === "html"
        ? "html"
        : lang === "markdown" || lang === "md"
        ? "markdown"
        : "code";
    onOpenArtifact({
      id: `code-${Date.now()}`,
      title: `${lang || "code"} snippet`,
      language: lang || "text",
      type,
      content: codeText
    });
  };

  return (
    <div className={`code-block ${collapsed ? "code-block--collapsed" : ""}`}>
      <div className="code-block__header">
        <div className="code-block__left">
          <span className="code-block__lang mono">{lang || "text"}</span>
          <span className="code-block__lines mono">{linesCount} lines</span>
        </div>
        <div className="code-block__actions">
          {onOpenArtifact && (
            <button
              type="button"
              className="code-block__btn mono"
              onClick={handleOpenArtifact}
              title="Open full file in Canvas (⌘K)"
            >
              canvas ↗
            </button>
          )}
          {isLong && (
            <button
              type="button"
              className="code-block__btn mono"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? "expand ↓" : "collapse ↑"}
            </button>
          )}
          <button
            type="button"
            className="code-block__btn mono"
            onClick={handleCopy}
            title="Copy code to clipboard"
          >
            {copied ? "copied ✓" : "copy"}
          </button>
        </div>
      </div>
      <div className="code-block__body">
        <pre>
          <code className={className}>{children}</code>
        </pre>
      </div>
    </div>
  );
}
