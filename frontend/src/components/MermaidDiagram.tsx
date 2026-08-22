import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

interface Props {
  chart: string;
}

let mermaidInitialized = false;

function initMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "loose",
    themeVariables: {
      darkMode: true,
      background: "#0c0d0f",
      primaryColor: "#1a2333",
      primaryBorderColor: "#5b8def",
      primaryTextColor: "#edeef0",
      secondaryColor: "#141517",
      secondaryBorderColor: "#2a2d31",
      secondaryTextColor: "#edeef0",
      tertiaryColor: "#0c0d0f",
      tertiaryBorderColor: "#1f2124",
      tertiaryTextColor: "#8b8d93",
      lineColor: "#5b8def",
      textColor: "#edeef0",
      fontFamily: "Inter, -apple-system, sans-serif"
    }
  });
  mermaidInitialized = true;
}

export function MermaidDiagram({ chart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const id = useId().replace(/:/g, "_");

  useEffect(() => {
    let active = true;
    initMermaid();

    const render = async () => {
      try {
        const cleanChart = chart.trim();
        if (!cleanChart) return;
        const { svg } = await mermaid.render(`mermaid_${id}`, cleanChart);
        if (active) {
          setSvgContent(svg);
          setError(null);
        }
      } catch (err) {
        if (active) {
          console.warn("Mermaid render error:", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void render();
    return () => {
      active = false;
    };
  }, [chart, id]);

  const zoomIn = () => setZoom((z) => Math.min(2.5, Number((z + 0.2).toFixed(1))));
  const zoomOut = () => setZoom((z) => Math.max(0.5, Number((z - 0.2).toFixed(1))));
  const resetZoom = () => setZoom(1);

  return (
    <div className="mermaid-card">
      <div className="mermaid-card__header">
        <div className="mermaid-card__label-group">
          <span className="mermaid-card__icon mono">❖</span>
          <span className="mermaid-card__title mono">diagram</span>
        </div>

        <div className="mermaid-card__actions">
          {!showCode && !error && (
            <div className="mermaid-card__zoom-controls">
              <button
                type="button"
                className="mermaid-card__btn mono"
                onClick={zoomOut}
                title="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                className="mermaid-card__btn mono"
                onClick={resetZoom}
                title="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className="mermaid-card__btn mono"
                onClick={zoomIn}
                title="Zoom in"
              >
                +
              </button>
            </div>
          )}

          <button
            type="button"
            className="mermaid-card__btn mono"
            onClick={() => setShowCode(!showCode)}
          >
            {showCode ? "diagram" : "source"}
          </button>
        </div>
      </div>

      <div className="mermaid-card__body">
        {showCode ? (
          <pre className="mermaid-card__code mono">
            <code>{chart.trim()}</code>
          </pre>
        ) : error ? (
          <div className="mermaid-card__error mono">
            <span className="error__mark">!</span>
            <span>Failed to render diagram: {error}</span>
            <pre className="mermaid-card__fallback">
              <code>{chart.trim()}</code>
            </pre>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="mermaid-card__svg-container"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>
    </div>
  );
}
