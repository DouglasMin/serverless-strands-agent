import { useState } from "react";
import type { DocumentArtifact, ArtifactItem } from "../lib/types";

interface DocumentCardProps {
  document: DocumentArtifact;
  onOpenCanvas?: (artifact: ArtifactItem) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getOfficeMeta(fileType?: string, filename?: string): {
  icon: string;
  badge: string;
  themeClass: string;
} {
  const t = String(fileType || filename || "").toLowerCase();
  if (t.includes("excel") || t.includes("spreadsheet") || t.includes("xlsx") || t.includes("xls")) {
    return {
      icon: "/tool-icons/excel.svg",
      badge: "EXCEL",
      themeClass: "document-card--excel"
    };
  }
  if (t.includes("word") || t.includes("doc") || t.includes("docx")) {
    return {
      icon: "/tool-icons/word.svg",
      badge: "WORD",
      themeClass: "document-card--word"
    };
  }
  if (t.includes("powerpoint") || t.includes("presentation") || t.includes("pptx") || t.includes("ppt")) {
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

export function DocumentCard({ document: rawDoc, onOpenCanvas }: DocumentCardProps) {
  const doc = rawDoc as any;
  const filename = String(doc.filename || doc.name || "document");
  const fileType = String(doc.fileType || doc.file_type || doc.type || "");
  const sizeBytes = Number(doc.sizeBytes ?? doc.size_bytes ?? 0);
  const downloadUrl = String(
    doc.url || doc.dataUri || doc.data_uri || doc.s3Uri || doc.s3_uri || ""
  );
  const summary = doc.summary ? String(doc.summary) : undefined;

  const [downloading, setDownloading] = useState(false);
  const meta = getOfficeMeta(fileType, filename);

  const handleDownload = () => {
    if (!downloadUrl) {
      console.warn("No download URL available for document:", filename);
      return;
    }
    try {
      setDownloading(true);
      const link = window.document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
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
      id: filename,
      title: filename,
      type: "document",
      content: `# ${filename}\n\n**File Type:** ${meta.badge}\n**File Size:** ${formatBytes(sizeBytes)}\n${summary ? `**Summary:** ${summary}\n` : ""}\n\nClick the download button above or in the message bubble to save the binary file.`
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
              <span className="document-card__title">{filename}</span>
              <span className="document-card__badge">{meta.badge}</span>
            </div>
            <div className="document-card__meta">
              <span className="document-card__size">{formatBytes(sizeBytes)}</span>
              {summary && (
                <>
                  <span className="document-card__dot">•</span>
                  <span className="document-card__summary">{summary}</span>
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
