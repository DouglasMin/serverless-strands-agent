import type { RoutePreview } from "../lib/types";

interface Props {
  preview: RoutePreview;
  onSetReminder?: (preview: RoutePreview) => void;
}

export function RoutePreviewCard({ preview, onSetReminder }: Props) {
  const canSetReminder = Boolean(preview.eventId && onSetReminder);
  const embedUrl = buildMapsEmbedUrl(preview);

  return (
    <div className="route-card">
      <div className="route-card__map">
        {embedUrl ? (
          <iframe
            className="route-card__embed"
            src={embedUrl}
            title={`Route to ${preview.destinationLabel}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            tabIndex={-1}
          />
        ) : (
          <>
            <div className="route-card__line" />
            <span className="route-card__pin route-card__pin--start" />
            <span className="route-card__pin route-card__pin--end" />
          </>
        )}
      </div>
      <div className="route-card__body">
        <div className="route-card__label mono">
          {preview.travelMode.toLowerCase()}
        </div>
        <div className="route-card__title">{preview.destinationLabel}</div>
        {preview.originLabel && (
          <div className="route-card__origin">{preview.originLabel}</div>
        )}
        {(preview.durationText || preview.distanceText) && (
          <div className="route-card__meta">
            {preview.durationText && <span>{preview.durationText}</span>}
            {preview.distanceText && <span>{preview.distanceText}</span>}
          </div>
        )}
        <div className="route-card__actions">
          <a
            className="route-card__button"
            href={preview.mapsUrl}
            target="_blank"
            rel="noreferrer"
          >
            open maps
          </a>
          {canSetReminder && (
            <button
              className="route-card__button"
              type="button"
              onClick={() => onSetReminder?.(preview)}
            >
              set reminder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function buildMapsEmbedUrl(preview: RoutePreview): string | null {
  const origin = preview.origin;
  const destination = preview.destination;
  if (!origin || !destination) return null;

  const mode = {
    DRIVE: "driving",
    WALK: "walking",
    BICYCLE: "bicycling",
    TRANSIT: "transit"
  }[preview.travelMode.toUpperCase()] ?? "driving";

  const params = new URLSearchParams({
    output: "embed",
    saddr: `${origin.lat},${origin.lng}`,
    daddr: `${destination.lat},${destination.lng}`,
    dirflg: modeFlag(mode)
  });

  return `https://www.google.com/maps?${params.toString()}`;
}

function modeFlag(mode: string): string {
  if (mode === "walking") return "w";
  if (mode === "bicycling") return "b";
  if (mode === "transit") return "r";
  return "d";
}
