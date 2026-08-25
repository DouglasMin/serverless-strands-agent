import { useEffect, useRef } from "react";

export interface SlashCommand {
  id: string;
  command: string;
  label: string;
  icon: string;
  description: string;
  badge: string;
  template: string;
  mode?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "research",
    command: "/research",
    label: "Deep Research",
    icon: "🔬",
    description: "Launch multi-source web & academic paper research mission",
    badge: "SUBAGENT",
    template: "Perform a deep research mission on: ",
    mode: "research"
  },
  {
    id: "ppt",
    command: "/ppt",
    label: "PowerPoint Presentation",
    icon: "🎯",
    description: "Generate a 16:9 widescreen presentation deck with stat metrics",
    badge: "OFFICE",
    template: "Create a 4-slide PowerPoint presentation about: ",
    mode: "ppt"
  },
  {
    id: "excel",
    command: "/excel",
    label: "Excel Spreadsheet",
    icon: "📊",
    description: "Generate multi-sheet financial model with formulas and totals",
    badge: "OFFICE",
    template: "Create an Excel spreadsheet with financial projections for: ",
    mode: "excel"
  },
  {
    id: "word",
    command: "/word",
    label: "Word Document",
    icon: "📑",
    description: "Executive report dossier with chapter headings & callouts",
    badge: "OFFICE",
    template: "Generate an executive Word document dossier titled: ",
    mode: "word"
  },
  {
    id: "route",
    command: "/route",
    label: "Transit & Route",
    icon: "🗺️",
    description: "Find optimal driving/transit route & set Google Calendar reminder",
    badge: "MAPS",
    template: "Find the best route to: ",
    mode: "route"
  },
  {
    id: "finance",
    command: "/finance",
    label: "Financial Markets",
    icon: "📈",
    description: "Real-time stock quotes, moving averages, and market news",
    badge: "DATA",
    template: "Analyze stock quotes and market trends for: ",
    mode: "finance"
  },
  {
    id: "code",
    command: "/code",
    label: "Python Sandbox",
    icon: "💻",
    description: "Execute Python scripts for data science and visualizations",
    badge: "SANDBOX",
    template: "Run Python code to analyze and plot: ",
    mode: "code"
  }
];

interface SlashCommandMenuProps {
  filterText: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandMenu({
  filterText,
  selectedIndex,
  onSelect,
  onClose
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const query = filterText.toLowerCase().replace(/^\//, "").trim();
  const filtered = SLASH_COMMANDS.filter((cmd) => {
    if (!query) return true;
    return (
      cmd.command.toLowerCase().includes(query) ||
      cmd.label.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query) ||
      cmd.id.toLowerCase().includes(query)
    );
  });

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!menuRef.current) return;
    const selectedEl = menuRef.current.querySelector(".slash-menu__item--selected") as HTMLElement | null;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div className="slash-menu" ref={menuRef}>
      <div className="slash-menu__header">
        <span className="slash-menu__title mono">COMMANDS</span>
        <div className="slash-menu__header-right">
          <span className="slash-menu__hint mono">↑↓ navigate · ↵ select · Esc close</span>
          <button
            type="button"
            className="slash-menu__close-btn"
            onClick={onClose}
            title="Close command palette (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="slash-menu__list">
        {filtered.map((cmd, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={cmd.id}
              type="button"
              className={`slash-menu__item ${isSelected ? "slash-menu__item--selected" : ""}`}
              onClick={() => onSelect(cmd)}
            >
              <div className="slash-menu__item-left">
                <span className="slash-menu__item-icon">{cmd.icon}</span>
                <div className="slash-menu__item-info">
                  <div className="slash-menu__item-title-row">
                    <span className="slash-menu__item-command mono">{cmd.command}</span>
                    <span className="slash-menu__item-label">{cmd.label}</span>
                  </div>
                  <span className="slash-menu__item-desc">{cmd.description}</span>
                </div>
              </div>

              <span className={`slash-menu__item-badge badge--${cmd.id} mono`}>
                {cmd.badge}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
