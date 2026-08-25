import { useState, useRef, useEffect, useMemo } from "react";
import type { ChatMessage, DocumentArtifact } from "../lib/types";
import JSZip from "jszip";

interface ExportMenuProps {
  messages: ChatMessage[];
  title: string;
  sessionId?: string | null;
}

export function ExportMenu({ messages, title, sessionId }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Extract all unique documents generated in the conversation
  const allDocuments: DocumentArtifact[] = useMemo(() => {
    const docs: DocumentArtifact[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      if (msg.documents && Array.isArray(msg.documents)) {
        for (const doc of msg.documents) {
          const fn = doc.filename || "document";
          if (!seen.has(fn)) {
            seen.add(fn);
            docs.push(doc);
          }
        }
      }
    }
    return docs;
  }, [messages]);

  // Generate clean Markdown transcript
  const generateMarkdown = () => {
    const cleanTitle = title || "Conversation Session";
    const dateStr = new Date().toLocaleString();
    let md = `# ${cleanTitle}\n\n`;
    md += `*Exported from Serverless Strands AI on ${dateStr}*\n`;
    if (sessionId) md += `*Session ID: \`${sessionId}\`*\n\n`;
    md += `---\n\n`;

    for (const msg of messages) {
      const isUser = msg.role === "user";
      md += `### ${isUser ? "👤 User" : "🤖 Atelier (AI Assistant)"}\n\n`;

      if (msg.attachments && msg.attachments.length > 0) {
        md += `**Attachments:**\n`;
        for (const att of msg.attachments) {
          md += `- 📎 \`${att.filename}\` (${att.sizeBytes} bytes)\n`;
        }
        md += `\n`;
      }

      if (msg.tools && msg.tools.length > 0) {
        md += `*Tools Executed:* ${msg.tools.map((t) => `\`${t.name}\``).join(", ")}\n\n`;
      }

      if (msg.text) {
        md += `${msg.text}\n\n`;
      }

      if (msg.documents && msg.documents.length > 0) {
        md += `**Generated Deliverables:**\n`;
        for (const d of msg.documents) {
          const dlUrl = d.url || d.s3Uri || "";
          md += `- 📄 **${d.filename}** (${d.fileType || "file"}) ${
            dlUrl ? `[Download File](${dlUrl})` : ""
          }\n`;
        }
        md += `\n`;
      }

      if (msg.trace) {
        md += `> ⚡ **Telemetry:** Duration: ${msg.trace.durationMs}ms | Model: ${msg.trace.model} | Tools: ${msg.trace.toolsUsed.join(", ")}\n\n`;
      }

      md += `---\n\n`;
    }

    return md;
  };

  const handleCopyTranscript = () => {
    const md = generateMarkdown();
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setIsOpen(false);
    }, 1500);
  };

  const handleExportMarkdown = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeTitle = (title || "conversation").replace(/[^a-z0-9_-]/gi, "_");
    link.download = `${safeTitle}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  const handleExportHTML = () => {
    const md = generateMarkdown();
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title || "Session Report"} - Serverless Strands</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0c0d0f; color: #edeef0; line-height: 1.6; max-width: 860px; margin: 40px auto; padding: 0 24px; }
    h1 { color: #38bdf8; border-bottom: 2px solid #1f2124; padding-bottom: 12px; }
    h3 { margin-top: 28px; color: #7aa4f5; }
    pre, code { background: #141517; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; }
    pre { padding: 14px; overflow-x: auto; border: 1px solid #1f2124; }
    blockquote { border-left: 3px solid #38bdf8; margin: 12px 0; padding: 6px 14px; background: rgba(56, 189, 248, 0.06); }
    hr { border: none; border-top: 1px solid #1f2124; margin: 24px 0; }
    a { color: #38bdf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div style="font-size: 13px; color: #8b8d93; margin-bottom: 24px;">Serverless Strands AI Autonomous Session Report</div>
  <pre style="white-space: pre-wrap; font-family: inherit; font-size: 14px;">${md}</pre>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeTitle = (title || "conversation").replace(/[^a-z0-9_-]/gi, "_");
    link.download = `${safeTitle}_Report.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  const handleDownloadZip = async () => {
    try {
      setIsZipping(true);
      const zip = new JSZip();

      // 1. Add session conversation markdown
      const md = generateMarkdown();
      const safeTitle = (title || "conversation").replace(/[^a-z0-9_-]/gi, "_");
      zip.file(`${safeTitle}_Transcript.md`, md);

      // 2. Fetch and add all binary deliverables
      const deliverablesFolder = zip.folder("deliverables");

      for (const doc of allDocuments) {
        const dlUrl = doc.url || doc.dataUri || doc.s3Uri;
        const filename = doc.filename || "deliverable";

        if (dlUrl && deliverablesFolder) {
          try {
            if (dlUrl.startsWith("data:")) {
              const base64Data = dlUrl.split(",")[1];
              deliverablesFolder.file(filename, base64Data, { base64: true });
            } else {
              const res = await fetch(dlUrl);
              const blob = await res.blob();
              deliverablesFolder.file(filename, blob);
            }
          } catch (err) {
            console.warn(`Could not add ${filename} to zip:`, err);
          }
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeTitle}_Deliverables.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate ZIP archive:", err);
    } finally {
      setIsZipping(false);
      setIsOpen(false);
    }
  };

  if (messages.length === 0) return null;

  return (
    <div className="export-menu-container" ref={menuRef}>
      <button
        type="button"
        className="export-menu__trigger mono"
        onClick={() => setIsOpen((o) => !o)}
        title="Export conversation & download deliverables bundle"
      >
        <span>Export</span>
        <span className="export-menu__arrow">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="export-menu__dropdown">
          <div className="export-menu__header mono">EXPORT & ARCHIVE</div>

          <button
            type="button"
            className="export-menu__item"
            onClick={handleDownloadZip}
            disabled={isZipping}
          >
            <span className="export-menu__item-icon">📦</span>
            <div className="export-menu__item-content">
              <span className="export-menu__item-title">
                {isZipping ? "Bundling ZIP..." : "Download All Deliverables (.zip)"}
              </span>
              <span className="export-menu__item-subtitle">
                {allDocuments.length > 0
                  ? `${allDocuments.length} file(s) + transcript in 1 archive`
                  : "Includes full transcript & generated files"}
              </span>
            </div>
            {allDocuments.length > 0 && (
              <span className="export-menu__badge mono">{allDocuments.length}</span>
            )}
          </button>

          <button
            type="button"
            className="export-menu__item"
            onClick={handleExportMarkdown}
          >
            <span className="export-menu__item-icon">📑</span>
            <div className="export-menu__item-content">
              <span className="export-menu__item-title">Export as Markdown (.md)</span>
              <span className="export-menu__item-subtitle">Clean transcript for Obsidian / GitHub</span>
            </div>
          </button>

          <button
            type="button"
            className="export-menu__item"
            onClick={handleExportHTML}
          >
            <span className="export-menu__item-icon">🌐</span>
            <div className="export-menu__item-content">
              <span className="export-menu__item-title">Export as HTML Report</span>
              <span className="export-menu__item-subtitle">Styled standalone dossier</span>
            </div>
          </button>

          <div className="export-menu__divider" />

          <button
            type="button"
            className="export-menu__item"
            onClick={handleCopyTranscript}
          >
            <span className="export-menu__item-icon">📋</span>
            <div className="export-menu__item-content">
              <span className="export-menu__item-title">
                {copied ? "Copied to Clipboard ✓" : "Copy Markdown Transcript"}
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
