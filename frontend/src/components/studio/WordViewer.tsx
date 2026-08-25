import { useMemo } from "react";
import type { DocumentArtifact } from "../../lib/types";

interface SectionData {
  type: string;
  text?: string;
  items?: string[];
  headers?: string[];
  rows?: string[][];
  [key: string]: any;
}

interface WordViewerProps {
  document: DocumentArtifact;
}

export function WordViewer({ document }: WordViewerProps) {
  const sections: SectionData[] = useMemo(() => {
    if (document.sections && Array.isArray(document.sections) && document.sections.length > 0) {
      return document.sections;
    }
    return [
      {
        type: "subtitle",
        text: document.subtitle || document.summary || "Executive Document & Dossier"
      },
      {
        type: "heading_1",
        text: "1. Executive Overview"
      },
      {
        type: "paragraph",
        text: "This document was generated autonomously by Serverless Strands AI with structured chapter hierarchy, benchmark data, and executive callouts."
      },
      {
        type: "callout",
        text: "Direct S3 Download Ready: Click 'Download .docx ↓' in the toolbar to save this document to Microsoft Word format."
      }
    ];
  }, [document.sections, document.subtitle, document.summary]);

  const docTitle = document.title || document.filename.replace(/\.docx$/i, "");

  return (
    <div className="word-viewer">
      <div className="word-paper">
        {/* Document Header */}
        <header className="word-paper__header">
          <div className="word-paper__type-badge mono">EXECUTIVE REPORT</div>
          <h1 className="word-paper__title">{docTitle}</h1>
          <div className="word-paper__divider" />
        </header>

        {/* Document Sections Body */}
        <div className="word-paper__body">
          {sections.map((sec, idx) => {
            switch (sec.type) {
              case "subtitle":
                return (
                  <p key={idx} className="word-paper__subtitle">
                    {sec.text}
                  </p>
                );

              case "heading_1":
                return (
                  <h2 key={idx} className="word-paper__h1">
                    {sec.text}
                  </h2>
                );

              case "heading_2":
                return (
                  <h3 key={idx} className="word-paper__h2">
                    {sec.text}
                  </h3>
                );

              case "heading_3":
                return (
                  <h4 key={idx} className="word-paper__h3">
                    {sec.text}
                  </h4>
                );

              case "paragraph":
                return (
                  <p key={idx} className="word-paper__para">
                    {sec.text}
                  </p>
                );

              case "bullet_list":
                return (
                  <ul key={idx} className="word-paper__list">
                    {(sec.items || []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                );

              case "callout":
                return (
                  <div key={idx} className="word-paper__callout">
                    <span className="word-paper__callout-icon">💡</span>
                    <div className="word-paper__callout-text">{sec.text}</div>
                  </div>
                );

              case "table":
                return (
                  <div key={idx} className="word-paper__table-wrapper">
                    <table className="word-paper__table">
                      {sec.headers && (
                        <thead>
                          <tr>
                            {sec.headers.map((h, i) => (
                              <th key={i}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {(sec.rows || []).map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );

              default:
                return sec.text ? (
                  <p key={idx} className="word-paper__para">
                    {sec.text}
                  </p>
                ) : null;
            }
          })}
        </div>

        {/* Document Footer */}
        <footer className="word-paper__footer mono">
          <span>Serverless Strands Deliverables</span>
          <span>Confidential</span>
        </footer>
      </div>
    </div>
  );
}
