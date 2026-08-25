import { useState, useEffect } from "react";
import type { DocumentArtifact } from "../../lib/types";

interface SlideData {
  type?: string;
  title?: string;
  subtitle?: string;
  bullets?: string[];
  stats?: Array<{ value: string; label: string }>;
  col1_title?: string;
  col1_bullets?: string[];
  col2_title?: string;
  col2_bullets?: string[];
  [key: string]: any;
}

interface PowerPointViewerProps {
  document: DocumentArtifact;
}

export function PowerPointViewer({ document }: PowerPointViewerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Extract slides from document object or parse from markdown content fallback
  const rawSlides: SlideData[] = document.slides && Array.isArray(document.slides) ? document.slides : [];
  
  // Construct title slide if not present in slides array
  const slides: SlideData[] = rawSlides.length > 0
    ? (rawSlides[0]?.title === document.title ? rawSlides : [
        {
          type: "title",
          title: document.title || document.filename.replace(/\.pptx$/i, ""),
          subtitle: document.subtitle || document.summary || "Executive Presentation",
        },
        ...rawSlides,
      ])
    : [
        {
          type: "title",
          title: document.title || document.filename.replace(/\.pptx$/i, ""),
          subtitle: document.subtitle || document.summary || "Executive Presentation",
        },
        {
          type: "bullets",
          title: "Executive Summary",
          bullets: [
            "High-impact slide presentation compiled autonomously",
            "Structured layouts with visual statistics & two-column benchmarks",
            "Direct download available in .pptx format"
          ]
        }
      ];

  const totalSlides = slides.length;
  const isDark = (document.theme || "dark").toLowerCase() === "dark";

  const nextSlide = () => setCurrentSlide((s) => Math.min(s + 1, totalSlides - 1));
  const prevSlide = () => setCurrentSlide((s) => Math.max(s - 1, 0));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") nextSlide();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") prevSlide();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalSlides]);

  const slide = slides[currentSlide] || slides[0];

  return (
    <div className="ppt-viewer">
      {/* Slide Navigation Toolbar */}
      <div className="ppt-viewer__nav-bar">
        <div className="ppt-viewer__nav-left">
          <button
            type="button"
            className="ppt-viewer__nav-btn"
            onClick={prevSlide}
            disabled={currentSlide === 0}
            title="Previous Slide (←)"
          >
            ‹ Prev
          </button>
          <span className="ppt-viewer__counter mono">
            Slide {currentSlide + 1} of {totalSlides}
          </span>
          <button
            type="button"
            className="ppt-viewer__nav-btn"
            onClick={nextSlide}
            disabled={currentSlide === totalSlides - 1}
            title="Next Slide (→)"
          >
            Next ›
          </button>
        </div>

        <div className="ppt-viewer__theme-badge mono">
          {isDark ? "🌙 Dark Theme" : "☀️ Light Theme"}
        </div>
      </div>

      {/* 16:9 Presentation Canvas */}
      <div className="ppt-viewer__viewport">
        <div className={`ppt-slide ${isDark ? "ppt-slide--dark" : "ppt-slide--light"}`}>
          {/* Header Row */}
          {slide.type !== "title" && (
            <div className="ppt-slide__header">
              <h2 className="ppt-slide__title">{slide.title || "Slide Title"}</h2>
              <div className="ppt-slide__deco-line" />
            </div>
          )}

          {/* Slide Content by Type */}
          <div className="ppt-slide__body">
            {slide.type === "title" ? (
              <div className="ppt-slide__title-layout">
                <div className="ppt-slide__brand-pill mono">PRESENTATION DECK</div>
                <h1 className="ppt-slide__main-title">{slide.title}</h1>
                {slide.subtitle && <p className="ppt-slide__subtitle">{slide.subtitle}</p>}
              </div>
            ) : slide.type === "stats" && slide.stats ? (
              <div className="ppt-slide__stats-grid">
                {slide.stats.map((stat, i) => (
                  <div key={i} className="ppt-stat-card">
                    <span className="ppt-stat-card__value mono">{stat.value}</span>
                    <span className="ppt-stat-card__label">{stat.label}</span>
                  </div>
                ))}
              </div>
            ) : slide.type === "two_column" ? (
              <div className="ppt-slide__two-col">
                <div className="ppt-col-box">
                  <h3 className="ppt-col-box__title">{slide.col1_title || "Overview"}</h3>
                  <ul className="ppt-bullet-list">
                    {(slide.col1_bullets || []).map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
                <div className="ppt-col-box ppt-col-box--accent">
                  <h3 className="ppt-col-box__title">{slide.col2_title || "Key Takeaways"}</h3>
                  <ul className="ppt-bullet-list">
                    {(slide.col2_bullets || []).map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <ul className="ppt-bullet-list ppt-bullet-list--primary">
                {(slide.bullets || []).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer branding */}
          <div className="ppt-slide__footer">
            <span className="mono">Serverless Strands AI</span>
            <span className="mono">{currentSlide + 1} / {totalSlides}</span>
          </div>
        </div>
      </div>

      {/* Slide Thumbnails Selector Bar */}
      <div className="ppt-viewer__thumbnails">
        {slides.map((s, idx) => (
          <button
            key={idx}
            type="button"
            className={`ppt-thumb ${idx === currentSlide ? "ppt-thumb--active" : ""}`}
            onClick={() => setCurrentSlide(idx)}
            title={`Go to slide ${idx + 1}: ${s.title || "Slide"}`}
          >
            <span className="ppt-thumb__num mono">{idx + 1}</span>
            <span className="ppt-thumb__title">{s.title || `Slide ${idx + 1}`}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
