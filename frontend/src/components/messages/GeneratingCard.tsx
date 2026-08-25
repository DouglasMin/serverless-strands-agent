
export type DeliverableType = "powerpoint" | "word" | "excel";

interface GeneratingCardProps {
  type: DeliverableType;
}

const CONFIGS: Record<
  DeliverableType,
  {
    icon: string;
    title: string;
    badge: string;
    summary: string;
    cardClass: string;
  }
> = {
  powerpoint: {
    icon: "/tool-icons/powerpoint.svg",
    title: "Generating PowerPoint Presentation (.pptx)...",
    badge: "BUILDING SLIDES",
    summary: "Applying widescreen themes, structured layouts & visual cards...",
    cardClass: "document-card--powerpoint"
  },
  word: {
    icon: "/tool-icons/word.svg",
    title: "Generating Word Document (.docx)...",
    badge: "FORMATTING REPORT",
    summary: "Structuring executive chapters, benchmarks, styled tables & callouts...",
    cardClass: "document-card--word"
  },
  excel: {
    icon: "/tool-icons/excel.svg",
    title: "Compiling Excel Spreadsheet (.xlsx)...",
    badge: "CALCULATING DATA",
    summary: "Calculating formulas, formatting sheets & styled header bands...",
    cardClass: "document-card--excel"
  }
};

export function GeneratingCard({ type }: GeneratingCardProps) {
  const config = CONFIGS[type];
  if (!config) return null;

  return (
    <div className={`document-card document-card--generating ${config.cardClass}`}>
      <div className="document-card__header">
        <div className="document-card__left">
          <img
            src={config.icon}
            alt=""
            className="document-card__icon document-card__icon--spinning"
            width={24}
            height={24}
          />
          <div className="document-card__info">
            <div className="document-card__title-row">
              <span className="document-card__title">{config.title}</span>
              <span className="document-card__badge document-card__badge--pulsing">
                {config.badge}
              </span>
            </div>
            <div className="document-card__meta">
              <span className="document-card__summary">{config.summary}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="document-card__progress-line">
        <div className="document-card__progress-bar-glow" />
      </div>
    </div>
  );
}
