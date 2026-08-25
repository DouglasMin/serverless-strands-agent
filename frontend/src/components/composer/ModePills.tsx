export type AgentMode =
  | "auto"
  | "research"
  | "ppt"
  | "excel"
  | "word"
  | "route"
  | "finance";

export interface ModeItem {
  id: AgentMode;
  label: string;
  icon: string;
  placeholder: string;
  promptPrefix: string;
}

export const AGENT_MODES: ModeItem[] = [
  {
    id: "auto",
    label: "Auto",
    icon: "✨",
    placeholder: "Message atelier or drop datasets…",
    promptPrefix: ""
  },
  {
    id: "research",
    label: "Deep Research",
    icon: "🔬",
    placeholder: "Enter research topic for multi-source investigation…",
    promptPrefix: "Perform a deep research mission on: "
  },
  {
    id: "ppt",
    label: "PowerPoint",
    icon: "🎯",
    placeholder: "Describe presentation topic & slide requirements…",
    promptPrefix: "Create a 4-slide PowerPoint presentation about: "
  },
  {
    id: "excel",
    label: "Excel",
    icon: "📊",
    placeholder: "Describe financial model or dataset to generate in Excel…",
    promptPrefix: "Create an Excel spreadsheet with financial projections for: "
  },
  {
    id: "word",
    label: "Word",
    icon: "📑",
    placeholder: "Describe executive document or dossier to create…",
    promptPrefix: "Generate an executive Word document dossier titled: "
  },
  {
    id: "route",
    label: "Route",
    icon: "🗺️",
    placeholder: "Enter destination for transit directions & calendar reminder…",
    promptPrefix: "Find the best route to: "
  },
  {
    id: "finance",
    label: "Financial",
    icon: "📈",
    placeholder: "Enter stock tickers (e.g. AAPL, NVDA, TSLA) to analyze…",
    promptPrefix: "Analyze stock quotes and market trends for: "
  }
];

interface ModePillsProps {
  activeMode: AgentMode;
  onSelectMode: (mode: AgentMode) => void;
  disabled?: boolean;
}

export function ModePills({ activeMode, onSelectMode, disabled }: ModePillsProps) {
  return (
    <div className="mode-pills" role="toolbar" aria-label="Agent specialized modes">
      {AGENT_MODES.map((m) => {
        const isActive = activeMode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            className={`mode-pill ${isActive ? "mode-pill--active" : ""}`}
            onClick={() => onSelectMode(isActive && m.id !== "auto" ? "auto" : m.id)}
            disabled={disabled}
            title={m.placeholder}
          >
            <span className="mode-pill__icon">{m.icon}</span>
            <span className="mode-pill__label">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
