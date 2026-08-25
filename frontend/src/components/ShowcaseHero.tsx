interface PromptBubble {
  id: string;
  icon: string;
  label: string;
  prompt: string;
}

const PROMPT_BUBBLES: PromptBubble[] = [
  {
    id: "excel",
    icon: "📊",
    label: "Generate 3-Year SaaS Financial Model (.xlsx)",
    prompt:
      "Create a comprehensive 3-year SaaS financial model in Excel (.xlsx) with monthly MRR projections, customer churn curves, expense breakdowns, and summary total formulas."
  },
  {
    id: "ppt",
    icon: "🎯",
    label: "Build a 4-Slide AI Architecture Deck (.pptx)",
    prompt:
      "Create a 4-slide 16:9 widescreen PowerPoint presentation (.pptx) about Autonomous Serverless AI Agents with executive summary, architecture metrics, and next steps."
  },
  {
    id: "research",
    icon: "🔬",
    label: "Deep Research Quantum Error Correction on arXiv",
    prompt:
      "Perform a deep research mission on recent breakthroughs in topological quantum error correction, synthesizing arXiv academic papers and key technical takeaways."
  },
  {
    id: "route",
    icon: "🗺️",
    label: "Route from Gangnam to Pangyo & Schedule Reminder",
    prompt:
      "Find the optimal driving route from Gangnam Station to Pangyo Tech Valley, preview the distance and travel time, and prepare a departure reminder for Google Calendar."
  }
];

interface Props {
  onSuggest?: (text: string) => void;
}

export function ShowcaseHero({ onSuggest }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-state__header">
        <h2 className="empty-state__title">How can I help you today?</h2>
        <p className="empty-state__subtitle">
          Ask a question, launch a deep research mission, or generate office deliverables.
        </p>
      </div>

      <div className="empty-state__bubbles">
        {PROMPT_BUBBLES.map((b) => (
          <button
            key={b.id}
            type="button"
            className="prompt-bubble"
            onClick={() => onSuggest?.(b.prompt)}
          >
            <span className="prompt-bubble__icon">{b.icon}</span>
            <span className="prompt-bubble__text">{b.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
