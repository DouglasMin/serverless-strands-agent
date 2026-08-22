import { useId, useMemo, useState } from "react";
import type { StockQuoteData } from "../lib/types";

interface Props {
  data: StockQuoteData;
}

type Timeframe = "1D" | "5D" | "1M" | "6M" | "1Y";

export function FinancialChartCard({ data }: Props) {
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("1D");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartId = useId();

  // Synthetic price points if history not provided, scaled by timeframe
  const points = useMemo(() => {
    if (data.historicalPoints && data.historicalPoints.length > 1) {
      return data.historicalPoints;
    }
    const base = data.price;
    const count = activeTimeframe === "1D" ? 24 : activeTimeframe === "5D" ? 30 : 40;
    const volatility = (data.changePercent ? Math.abs(data.changePercent) / 100 : 0.02) * base;
    const isUp = (data.change ?? 0) >= 0;

    const res: { time: string; price: number }[] = [];
    let current = isUp ? base - (data.change || base * 0.02) : base + Math.abs(data.change || base * 0.02);

    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const trend = isUp ? progress * (base - current) : -progress * (current - base);
      const noise = (Math.sin(i * 0.8) + Math.cos(i * 1.5)) * (volatility * 0.4);
      const p = Math.max(0.1, Number((current + trend + noise).toFixed(2)));
      res.push({
        time: activeTimeframe === "1D" ? `${9 + Math.floor(i / 3)}:${(i % 3) * 20 || "00"}` : `Day ${i + 1}`,
        price: i === count - 1 ? base : p
      });
    }
    return res;
  }, [data, activeTimeframe]);

  const minPrice = Math.min(...points.map((p) => p.price));
  const maxPrice = Math.max(...points.map((p) => p.price));
  const priceRange = maxPrice - minPrice || 1;

  const width = 360;
  const height = 120;
  const padding = 8;

  const coordinates = useMemo(() => {
    return points.map((p, idx) => {
      const x = padding + (idx / (points.length - 1)) * (width - padding * 2);
      const y = height - padding - ((p.price - minPrice) / priceRange) * (height - padding * 2);
      return { x, y, price: p.price, time: p.time };
    });
  }, [points, minPrice, priceRange]);

  const pathD = useMemo(() => {
    if (coordinates.length === 0) return "";
    return coordinates.reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
    }, "");
  }, [coordinates]);

  const areaD = useMemo(() => {
    if (coordinates.length === 0) return "";
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    return `${pathD} L ${last.x} ${height} L ${first.x} ${height} Z`;
  }, [coordinates, pathD]);

  const isPositive = (data.change ?? 0) >= 0;
  const strokeColor = isPositive ? "#4ade80" : "#f87171";

  const activePoint = hoverIndex !== null ? coordinates[hoverIndex] : coordinates[coordinates.length - 1];
  const displayPrice = activePoint ? activePoint.price : data.price;

  return (
    <div className="financial-card">
      <div className="financial-card__header">
        <div>
          <div className="financial-card__symbol-row">
            <span className="financial-card__symbol mono">{data.symbol}</span>
            {data.name && <span className="financial-card__name">{data.name}</span>}
          </div>
          <div className="financial-card__price-row">
            <span className="financial-card__price mono tnum">
              {data.currency || "$"}{displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {data.changePercent !== undefined && (
              <span className={`financial-card__change-pill mono ${isPositive ? "is-up" : "is-down"}`}>
                {isPositive ? "▲ +" : "▼ "}
                {Math.abs(data.changePercent).toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <div className="financial-card__timeframes">
          {(["1D", "5D", "1M", "6M", "1Y"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              className={`financial-card__tf-btn mono ${activeTimeframe === tf ? "is-active" : ""}`}
              onClick={() => setActiveTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="financial-card__chart-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="financial-card__svg"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
            const idx = Math.round(ratio * (coordinates.length - 1));
            setHoverIndex(idx);
          }}
        >
          <defs>
            <linearGradient id={`grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#grad-${chartId})`} />

          {/* Line stroke */}
          <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Hover indicator */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1="0"
                x2={activePoint.x}
                y2={height}
                stroke="var(--line-strong)"
                strokeDasharray="2 2"
              />
              <circle cx={activePoint.x} cy={activePoint.y} r="4" fill={strokeColor} stroke="var(--surface-1)" strokeWidth="2" />
            </g>
          )}
        </svg>

        {activePoint && hoverIndex !== null && (
          <div
            className="financial-card__tooltip mono"
            style={{ left: `${(activePoint.x / width) * 100}%` }}
          >
            <span>{activePoint.time}</span> · <span>${activePoint.price.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="financial-card__stats mono">
        {data.high !== undefined && (
          <div className="financial-card__stat">
            <span className="financial-card__stat-label">High</span>
            <span className="financial-card__stat-val">${data.high.toFixed(2)}</span>
          </div>
        )}
        {data.low !== undefined && (
          <div className="financial-card__stat">
            <span className="financial-card__stat-label">Low</span>
            <span className="financial-card__stat-val">${data.low.toFixed(2)}</span>
          </div>
        )}
        {data.volume && (
          <div className="financial-card__stat">
            <span className="financial-card__stat-label">Vol</span>
            <span className="financial-card__stat-val">{data.volume}</span>
          </div>
        )}
      </div>
    </div>
  );
}
