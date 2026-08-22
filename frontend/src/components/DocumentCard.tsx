import { useState } from "react";
import type { DocumentArtifact, ArtifactItem } from "../lib/types";

interface DocumentCardProps {
  document: DocumentArtifact;
  onOpenCanvas?: (artifact: ArtifactItem) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getOfficeMeta(fileType: string): {
  icon: string;
  badge: string;
  themeClass: string;
} {
  const t = fileType.toLowerCase();
  if (t.includes("excel") || t.includes("spreadsheet") || t.includes("xlsx")) {
    return {
      icon: "/tool-icons/excel.svg",
      badge: "EXCEL",
      themeClass: "document-card--excel"
    };
  }
  if (t.includes("word") || t.includes("doc")) {
    return {
      icon: "/tool-icons/word.svg",
      badge: "WORD",
      themeClass: "document-card--word"
    };
  }
  if (t.includes("powerpoint") || t.includes("presentation") || t.includes("pptx")) {
    return {
      icon: "/tool-icons/powerpoint.svg",
      badge: "POWERPOINT",
      themeClass: "document-card--powerpoint"
    };
  }
  return {
    icon: "/tool-icons/workspace.svg",
    badge: "DOCUMENT",
    themeClass: "document-card--generic"
  };
}

export function DocumentCard({ document: doc, onOpenCanvas }: DocumentCardProps) {
  const [downloading, setDownloading] = useState(false);
  const meta = getOfficeMeta(doc.fileType);

  const handleDownload = () => {
    try {
      setDownloading(true);
      const link = window.document.createElement("a");
      link.href = doc.dataUri;
      link.download = doc.filename;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setTimeout(() => setDownloading(false), 1200);
    }
  };

  const handleOpenCanvas = () => {
    if (!onOpenCanvas) return;
    onOpenCanvas({
      id: doc.filename,
      title: doc.filename,
      type: "document",
      content: `# ${doc.filename}\n\n**File Type:** ${meta.badge}\n**File Size:** ${formatBytes(doc.sizeBytes)}\n${doc.summary ? `**Summary:** ${doc.summary}\n` : ""}\n\nClick the download button above or in the message bubble to save the binary file.`
    });
  };

  return (
    <div className={`document-card ${meta.themeClass}`}>
      <div className="document-card__header">
        <div className="document-card__left">
          <img
            src={meta.icon}
            alt=""
            className="document-card__icon"
            width={24}
            height={24}
          />
          <div className="document-card__info">
            <div className="document-card__title-row">
              <span className="document-card__title">{doc.filename}</span>
              <span className="document-card__badge">{meta.badge}</span>
            </div>
            <div className="document-card__meta">
              <span className="document-card__size">{formatBytes(doc.sizeBytes)}</span>
              {doc.summary && (
                <>
                  <span className="document-card__dot">•</span>
                  <span className="document-card__summary">{doc.summary}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="document-card__actions">
          {onOpenCanvas && (
            <button
              type="button"
              className="document-card__canvas-btn"
              onClick={handleOpenCanvas}
              title="Open document details in canvas"
            >
              canvas ↗
            </button>
          )}
          <button
            type="button"
            className="document-card__download-btn"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? "Downloading..." : "Download File ↓"}
          </button>
        </div>
      </div>
    </div>
  );
}
