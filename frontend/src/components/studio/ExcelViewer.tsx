import { useState, useMemo } from "react";
import type { DocumentArtifact } from "../../lib/types";

interface SheetData {
  name: string;
  title?: string;
  headers: string[];
  rows: any[][];
  summary_row?: any[];
}

interface ExcelViewerProps {
  document: DocumentArtifact;
}

export function ExcelViewer({ document }: ExcelViewerProps) {
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  const sheets: SheetData[] = useMemo(() => {
    if (document.sheets && Array.isArray(document.sheets) && document.sheets.length > 0) {
      return document.sheets;
    }
    // Fallback sample sheet if raw binary
    return [
      {
        name: "Sheet1",
        title: document.filename.replace(/\.xlsx$/i, ""),
        headers: ["Column A", "Column B", "Column C", "Total"],
        rows: [
          ["Item 1", "1,200", "3,400", "4,600"],
          ["Item 2", "2,500", "4,100", "6,600"],
          ["Item 3", "3,100", "5,200", "8,300"],
        ],
        summary_row: ["Total", "6,800", "12,700", "19,500"],
      }
    ];
  }, [document.sheets, document.filename]);

  const currentSheet = sheets[activeSheetIdx] || sheets[0];

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return currentSheet.rows || [];
    const term = searchTerm.toLowerCase();
    return (currentSheet.rows || []).filter((r) =>
      r.some((c) => String(c).toLowerCase().includes(term))
    );
  }, [currentSheet, searchTerm]);

  return (
    <div className="excel-viewer">
      {/* Top Controls: Search & Sheet Info */}
      <div className="excel-viewer__top-bar">
        <div className="excel-viewer__search-box">
          <span className="excel-viewer__search-icon">🔍</span>
          <input
            type="text"
            className="excel-viewer__search-input mono"
            placeholder="Filter spreadsheet rows..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="excel-viewer__clear-btn"
              onClick={() => setSearchTerm("")}
            >
              ✕
            </button>
          )}
        </div>

        <div className="excel-viewer__stats mono">
          {filteredRows.length} {filteredRows.length === 1 ? "row" : "rows"} · {currentSheet.headers?.length || 0} cols
        </div>
      </div>

      {/* Spreadsheet Grid Container */}
      <div className="excel-viewer__table-container">
        <table className="excel-table">
          <thead>
            {/* Column Alphabet Index Row: #, A, B, C... */}
            <tr className="excel-table__index-row">
              <th className="excel-table__corner-cell">#</th>
              {(currentSheet.headers || []).map((_, i) => (
                <th key={i} className="excel-table__col-letter mono">
                  {String.fromCharCode(65 + i)}
                </th>
              ))}
            </tr>

            {/* Header Labels Row */}
            <tr className="excel-table__header-row">
              <th className="excel-table__row-num mono">1</th>
              {(currentSheet.headers || []).map((h, i) => (
                <th key={i} className="excel-table__header-cell">
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row, rIdx) => (
              <tr key={rIdx} className="excel-table__data-row">
                <td className="excel-table__row-num mono">{rIdx + 2}</td>
                {row.map((cell, cIdx) => {
                  const valStr = String(cell ?? "");
                  const isFormula = valStr.startsWith("=");
                  const isNumeric = !isNaN(Number(valStr.replace(/[$,%]/g, "")));

                  return (
                    <td
                      key={cIdx}
                      className={`excel-table__cell ${isNumeric ? "excel-table__cell--numeric" : ""} ${
                        isFormula ? "excel-table__cell--formula" : ""
                      }`}
                    >
                      {valStr}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Summary / Total Row */}
            {currentSheet.summary_row && (
              <tr className="excel-table__summary-row">
                <td className="excel-table__row-num mono">{filteredRows.length + 2}</td>
                {currentSheet.summary_row.map((cell, cIdx) => (
                  <td key={cIdx} className="excel-table__summary-cell mono">
                    {String(cell ?? "")}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Sheet Switcher Tabs */}
      <div className="excel-viewer__sheet-bar">
        <div className="excel-viewer__sheet-tabs">
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.name || idx}
              type="button"
              className={`excel-sheet-tab ${idx === activeSheetIdx ? "excel-sheet-tab--active" : ""}`}
              onClick={() => {
                setActiveSheetIdx(idx);
                setSearchTerm("");
              }}
            >
              <span className="excel-sheet-tab__icon">📊</span>
              <span className="excel-sheet-tab__name">{sheet.name || `Sheet ${idx + 1}`}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
