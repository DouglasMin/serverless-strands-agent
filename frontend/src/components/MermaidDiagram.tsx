import { useEffect, useId, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";
import type { ArtifactItem } from "../lib/types";

interface Props {
  chart: string;
  onOpenArtifact?: (artifact: ArtifactItem) => void;
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
      fontFamily: "Inter, -apple-system, sans-serif",
      fontSize: "14px"
    }
  });
  mermaidInitialized = true;
}

export function MermaidDiagram({ chart, onOpenArtifact }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [zoom, setZoom] = useState(1.2); // Default to comfortable 120% readability
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  const zoomIn = () => setZoom((z) => Math.min(4.0, Number((z + 0.25).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))));
  const resetZoom = () => setZoom(1.0);
  const fitZoom = () => setZoom(1.5);

  const handleOpenInCanvas = useCallback(() => {
    if (onOpenArtifact) {
      onOpenArtifact({
        id: `diagram-${Date.now()}`,
        title: "Mermaid Architecture Diagram",
        type: "markdown",
        content: `\`\`\`mermaid\n${chart.trim()}\n\`\`\``
      });
    } else {
      setIsFullscreen(true);
    }
  }, [onOpenArtifact, chart]);

  // Handle ESC to close fullscreen modal
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  return (
    <>
      <div className="mermaid-card">
        <div className="mermaid-card__header">
          <div className="mermaid-card__label-group">
            <span className="mermaid-card__icon mono">❖</span>
            <span className="mermaid-card__title mono">Diagram Architecture</span>
          </div>

          <div className="mermaid-card__actions">
            {!showCode && !error && (
              <div className="mermaid-card__zoom-controls">
                <button
                  type="button"
                  className="mermaid-card__btn mono"
                  onClick={zoomOut}
                  title="Zoom out (−)"
                >
                  −
                </button>
                <button
                  type="button"
                  className="mermaid-card__btn mono"
                  onClick={resetZoom}
                  title="Reset to 100%"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="mermaid-card__btn mono"
                  onClick={zoomIn}
                  title="Zoom in (+)"
                >
                  +
                </button>
                <button
                  type="button"
                  className="mermaid-card__btn mono"
                  onClick={fitZoom}
                  title="Enlarge (150%)"
                >
                  1.5×
                </button>
              </div>
            )}

            {/* Fullscreen Lightbox Trigger */}
            {!showCode && !error && (
              <button
                type="button"
                className="mermaid-card__btn mono"
                onClick={() => setIsFullscreen(true)}
                title="Open fullscreen lightbox"
              >
                ⛶ Fullscreen
              </button>
            )}

            {/* Open in Workspace Studio Canvas */}
            {onOpenArtifact && !showCode && !error && (
              <button
                type="button"
                className="mermaid-card__btn mono mermaid-card__btn--canvas"
                onClick={handleOpenInCanvas}
                title="Open diagram in Workspace Studio Canvas"
              >
                Studio ↗
              </button>
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
            <div className="mermaid-card__viewport">
              <div
                ref={containerRef}
                className="mermaid-card__svg-container"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center"
                }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Modal Lightbox */}
      {isFullscreen && (
        <div className="mermaid-lightbox" onClick={() => setIsFullscreen(false)}>
          <div className="mermaid-lightbox__modal" onClick={(e) => e.stopPropagation()}>
            <div className="mermaid-lightbox__header">
              <div className="mermaid-lightbox__title mono">
                <span>❖</span> Architecture Diagram (Fullscreen View)
              </div>
              <div className="mermaid-lightbox__actions">
                <div className="mermaid-card__zoom-controls">
                  <button type="button" className="mermaid-card__btn mono" onClick={zoomOut}>
                    −
                  </button>
                  <button type="button" className="mermaid-card__btn mono" onClick={resetZoom}>
                    {Math.round(zoom * 100)}%
                  </button>
                  <button type="button" className="mermaid-card__btn mono" onClick={zoomIn}>
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="mermaid-lightbox__close"
                  onClick={() => setIsFullscreen(false)}
                  title="Close Fullscreen (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mermaid-lightbox__body">
              <div
                className="mermaid-lightbox__svg-container"
                style={{
                  transform: `scale(${Math.max(zoom, 1.4)})`,
                  transformOrigin: "center center"
                }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
