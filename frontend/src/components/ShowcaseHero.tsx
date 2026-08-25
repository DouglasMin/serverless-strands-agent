interface ShowcaseCard {
  id: string;
  badge: string;
  badgeClass: string;
  icon: string;
  title: string;
  description: string;
  prompt: string;
  accentColor: string;
}

const SHOWCASE_CARDS: ShowcaseCard[] = [
  {
    id: "excel",
    badge: "EXCEL",
    badgeClass: "showcase-card__badge--excel",
    icon: "📊",
    title: "3-Year SaaS Financial Model",
    description:
      "Generate an Excel (.xlsx) workbook with multi-sheet MRR projections, growth metrics, and formatted totals.",
    prompt:
      "Create a comprehensive 3-year SaaS financial model in Excel (.xlsx) with monthly MRR projections, customer churn curves, expense breakdowns, and summary total formulas.",
    accentColor: "#10b981"
  },
  {
    id: "ppt",
    badge: "POWERPOINT",
    badgeClass: "showcase-card__badge--ppt",
    icon: "🎯",
    title: "AI Agent Architecture Pitch",
    description:
      "Build a 4-slide 16:9 widescreen presentation (.pptx) with stat metrics and 2-column feature benchmarks.",
    prompt:
      "Create a 4-slide 16:9 widescreen PowerPoint presentation (.pptx) about Autonomous Serverless AI Agents with executive summary, architecture metrics, and next steps.",
    accentColor: "#f97316"
  },
  {
    id: "research",
    badge: "DEEP RESEARCH",
    badgeClass: "showcase-card__badge--research",
    icon: "🔬",
    title: "Quantum Error Correction",
    description:
      "Launch a multi-step research mission querying recent arXiv papers and technical web sources.",
    prompt:
      "Perform a deep research mission on recent breakthroughs in topological quantum error correction, synthesizing arXiv academic papers and key technical takeaways.",
    accentColor: "#a855f7"
  },
  {
    id: "route",
    badge: "MOBILITY",
    badgeClass: "showcase-card__badge--route",
    icon: "🗺️",
    title: "Gangnam to Pangyo Route & Calendar",
    description:
      "Find driving route previews, calculate distance matrix, and prepare a Google Calendar reminder.",
    prompt:
      "Find the optimal driving route from Gangnam Station to Pangyo Tech Valley, preview the distance and travel time, and prepare a departure reminder for Google Calendar.",
    accentColor: "#0284c7"
  }
];

interface Props {
  onSuggest?: (text: string) => void;
}

export function ShowcaseHero({ onSuggest }: Props) {
  return (
    <div className="showcase-hero">
      <div className="showcase-hero__header">
        <div className="showcase-hero__tag mono">
          <span className="showcase-hero__tag-dot" />
          <span>AUTONOMOUS MULTI-AGENT ATELIER</span>
        </div>
        <h2 className="showcase-hero__title">
          What would you like to build or investigate?
        </h2>
        <p className="showcase-hero__subtitle">
          Execute specialized office deliverables, deep research missions, or custom computational workflows.
        </p>
      </div>

      <div className="showcase-hero__grid">
        {SHOWCASE_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            className="showcase-card"
            style={
              {
                "--card-accent": card.accentColor
              } as React.CSSProperties
            }
            onClick={() => onSuggest?.(card.prompt)}
          >
            <div className="showcase-card__top">
              <div className="showcase-card__icon-wrap">
                <span className="showcase-card__icon">{card.icon}</span>
              </div>
              <span className={`showcase-card__badge mono ${card.badgeClass}`}>
                {card.badge}
              </span>
            </div>

            <div className="showcase-card__body">
              <h3 className="showcase-card__title">{card.title}</h3>
              <p className="showcase-card__desc">{card.description}</p>
            </div>

            <div className="showcase-card__footer">
              <span className="showcase-card__cta mono">Run prompt</span>
              <span className="showcase-card__arrow">→</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
