import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SubAgentTask } from "../lib/types";

interface Props {
  task: SubAgentTask | null;
  onClose: () => void;
}

export function SubAgentCanvas({ task, onClose }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "sources" | "dossier">("timeline");
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!task) return;
    if (task.status === "completed" || task.status === "error") {
      const duration = (task.endTime || Date.now()) - task.startTime;
      setElapsedSec(Math.max(0, Math.round(duration / 1000)));
      return;
    }

    const interval = setInterval(() => {
      setElapsedSec(Math.max(0, Math.round((Date.now() - task.startTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [task?.startTime, task?.endTime, task?.status]);

  if (!task) return null;

  const isRunning = task.status !== "completed" && task.status !== "error";

  // Calculate current stage index (0: Decompose, 1: Parallel Search, 2: Synthesize, 3: Done)
  let currentStageIndex = 0;
  if (task.status === "searching") currentStageIndex = 1;
  else if (task.status === "synthesizing") currentStageIndex = 2;
  else if (task.status === "completed") currentStageIndex = 3;

  return (
    <aside className={`subagent-canvas ${fullscreen ? "is-fullscreen" : ""}`}>
      {/* ─── Header ─── */}
      <div className="subagent-canvas__header">
        <div className="subagent-canvas__title-group">
          <div className="subagent-canvas__agent-icon">
            <span className="subagent-canvas__pulse-ring" />
            <span className="subagent-canvas__glyph">🔬</span>
          </div>
          <div className="subagent-canvas__titles">
            <div className="subagent-canvas__badge-row">
              <span className="subagent-canvas__runtime-badge mono">
                Bedrock AgentCore Runtime
              </span>
              <span className={`subagent-canvas__status-badge mono status-${task.status}`}>
                {isRunning ? (
                  <>
                    <span className="subagent-canvas__spinner" />
                    {task.status === "planning"
                      ? "DECOMPOSING..."
                      : task.status === "searching"
                        ? "PARALLEL SEARCH..."
                        : task.status === "synthesizing"
                          ? "SYNTHESIZING..."
                          : task.status.toUpperCase() + "..."}
                  </>
                ) : (
                  task.status.toUpperCase()
                )}
              </span>
              <span className="subagent-canvas__timer mono">
                ⏱ {elapsedSec}s
              </span>
            </div>
            <h3 className="subagent-canvas__title">
              {task.agentName}: {task.topic}
            </h3>
          </div>
        </div>

        <div className="subagent-canvas__actions">
          <button
            type="button"
            className="subagent-canvas__btn mono"
            onClick={() => setFullscreen(!fullscreen)}
            title={fullscreen ? "Restore side view" : "Full screen"}
          >
            {fullscreen ? "restore" : "expand"}
          </button>
          <button
            type="button"
            className="subagent-canvas__close-btn mono"
            onClick={onClose}
            aria-label="Close canvas"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ─── Progress Stepper ─── */}
      <div className="subagent-canvas__stepper">
        <div className={`subagent-step ${currentStageIndex >= 0 ? "is-active" : ""} ${currentStageIndex > 0 ? "is-done" : ""}`}>
          <span className="subagent-step__circle">{currentStageIndex > 0 ? "✓" : "1"}</span>
          <span className="subagent-step__label mono">Decompose</span>
        </div>
        <div className="subagent-step__line" />
        <div className={`subagent-step ${currentStageIndex >= 1 ? "is-active" : ""} ${currentStageIndex > 1 ? "is-done" : ""}`}>
          <span className="subagent-step__circle">{currentStageIndex > 1 ? "✓" : "2"}</span>
          <span className="subagent-step__label mono">Parallel Search</span>
        </div>
        <div className="subagent-step__line" />
        <div className={`subagent-step ${currentStageIndex >= 2 ? "is-active" : ""} ${currentStageIndex > 2 ? "is-done" : ""}`}>
          <span className="subagent-step__circle">{currentStageIndex > 2 ? "✓" : "3"}</span>
          <span className="subagent-step__label mono">Synthesize</span>
        </div>
        <div className="subagent-step__line" />
        <div className={`subagent-step ${currentStageIndex >= 3 ? "is-done" : ""}`}>
          <span className="subagent-step__circle">{currentStageIndex >= 3 ? "✓" : "4"}</span>
          <span className="subagent-step__label mono">Dossier</span>
        </div>
      </div>

      {/* ─── Tab Navigation ─── */}
      <div className="subagent-canvas__tabs">
        <button
          type="button"
          className={`subagent-canvas__tab-btn mono ${activeTab === "timeline" ? "is-active" : ""}`}
          onClick={() => setActiveTab("timeline")}
        >
          Activity Stream ({task.steps.length})
        </button>
        <button
          type="button"
          className={`subagent-canvas__tab-btn mono ${activeTab === "sources" ? "is-active" : ""}`}
          onClick={() => setActiveTab("sources")}
        >
          Discovered Sources ({task.sources.length})
        </button>
        {task.summary && (
          <button
            type="button"
            className={`subagent-canvas__tab-btn mono ${activeTab === "dossier" ? "is-active" : ""}`}
            onClick={() => setActiveTab("dossier")}
          >
            Dossier View
          </button>
        )}
      </div>

      {/* ─── Content Body ─── */}
      <div className="subagent-canvas__content">
        {activeTab === "timeline" && (
          <div className="subagent-timeline">
            {task.steps.length === 0 ? (
              <div className="subagent-empty mono">Sub-agent is initializing search vectors...</div>
            ) : (
              task.steps.map((st, idx) => (
                <div key={idx} className="subagent-timeline__item">
                  <div className="subagent-timeline__bullet">
                    <span className="subagent-timeline__dot" />
                  </div>
                  <div className="subagent-timeline__body">
                    <div className="subagent-timeline__meta">
                      {st.tool && (
                        <span className={`subagent-timeline__tool-pill mono tool-${st.tool}`}>
                          {st.tool === "arxiv_search"
                            ? "📄 ArXiv"
                            : st.tool === "wikipedia_search"
                              ? "📚 Wikipedia"
                              : st.tool === "tavily_search"
                                ? "🌐 Tavily Search"
                                : st.tool === "web_extract"
                                  ? "🔍 Web Extract"
                                  : st.tool}
                        </span>
                      )}
                      <span className="subagent-timeline__time mono">{st.time}</span>
                    </div>
                    <p className="subagent-timeline__text">{st.detail}</p>
                    {st.query && (
                      <div className="subagent-timeline__query mono">
                        <code>{st.query}</code>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "sources" && (
          <div className="subagent-sources-grid">
            {task.sources.length === 0 ? (
              <div className="subagent-empty mono">Scanning ArXiv, Wikipedia, and web databases...</div>
            ) : (
              task.sources.map((src, idx) => (
                <article key={idx} className="subagent-source-card">
                  <div className="subagent-source-card__header">
                    <span className={`subagent-source-card__badge mono src-${src.source}`}>
                      {src.source === "arxiv"
                        ? "📄 ArXiv Preprint"
                        : src.source === "wikipedia"
                          ? "📚 Wikipedia"
                          : "🌐 Web Source"}
                    </span>
                    {src.published && (
                      <span className="subagent-source-card__date mono">{src.published}</span>
                    )}
                    {src.score !== undefined && (
                      <span className="subagent-source-card__score mono">
                        Relevance: {src.score}
                      </span>
                    )}
                  </div>
                  <h4 className="subagent-source-card__title">
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="subagent-source-card__link"
                    >
                      {src.title}
                      <span className="subagent-source-card__ext" aria-hidden>
                        ↗
                      </span>
                    </a>
                  </h4>
                  {src.snippet && (
                    <p className="subagent-source-card__snippet">{src.snippet}...</p>
                  )}
                </article>
              ))
            )}
          </div>
        )}

        {activeTab === "dossier" && task.summary && (
          <div className="subagent-dossier markdown-body">
            <Markdown remarkPlugins={[remarkGfm]}>{task.summary}</Markdown>
          </div>
        )}
      </div>
    </aside>
  );
}
