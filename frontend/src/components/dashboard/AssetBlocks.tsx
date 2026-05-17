import { useCallback } from "react";
import type { AssetStats } from "../../lib/dashboard";
import { cycleRisk } from "../../lib/dashboard";
import { formatCurrency } from "../../lib";
import type { RiskLevel, StylesMap } from "../../types";

type Props = {
  visibleAssets: AssetStats[];
  stylesMap: StylesMap | undefined;
  onChangeStyle: (asset: string, patch: { colorHex?: string | null; riskLevel?: RiskLevel | null }) => void;
};

export function AssetBlocks({ visibleAssets, stylesMap, onChangeStyle }: Props) {
  const handleColor = useCallback(
    (asset: string, value: string) => onChangeStyle(asset, { colorHex: value }),
    [onChangeStyle]
  );

  if (visibleAssets.length === 0) {
    return (
      <p className="dashboard-empty" data-testid="asset-blocks-empty">
        No assets to show. Add a transaction or toggle &quot;Show zero-value assets&quot;.
      </p>
    );
  }

  return (
    <div className="asset-blocks">
      {visibleAssets.map((stat) => {
        const styleEntry = stylesMap?.[stat.asset];
        const currentRisk = (stat.riskLevel ?? (styleEntry?.riskLevel as RiskLevel | null) ?? null) as RiskLevel | null;
        const colorValue = styleEntry?.colorHex ?? stat.color;
        const pnlClass = stat.pnl >= 0 ? "asset-block__pnl asset-block__pnl--up" : "asset-block__pnl asset-block__pnl--down";
        return (
          <article key={stat.asset} className="asset-block" data-testid={`asset-block-${stat.asset}`}>
            <header className="asset-block__head">
              <span className="asset-block__swatch" style={{ background: stat.color }} aria-hidden />
              <h3>{stat.asset}</h3>
            </header>
            <dl className="asset-block__stats">
              <div>
                <dt>Current</dt>
                <dd>{formatCurrency(stat.current)}</dd>
              </div>
              <div>
                <dt>Allocation</dt>
                <dd>{stat.allocationPct.toFixed(1)}%</dd>
              </div>
              <div>
                <dt>PnL</dt>
                <dd className={pnlClass}>{formatCurrency(stat.pnl)}</dd>
              </div>
              <div>
                <dt>PnL %</dt>
                <dd className={pnlClass}>{stat.pnlPct.toFixed(2)}%</dd>
              </div>
            </dl>
            <div className="asset-block__controls">
              <label className="asset-block__color">
                Color
                <input
                  type="color"
                  aria-label={`Color for ${stat.asset}`}
                  value={normalizeColor(colorValue)}
                  onChange={(e) => handleColor(stat.asset, e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`risk-pill risk-pill--${currentRisk ?? "none"}`}
                onClick={() => onChangeStyle(stat.asset, { riskLevel: cycleRisk(currentRisk) })}
                aria-label={`Risk level for ${stat.asset}`}
              >
                {currentRisk ? `risk: ${currentRisk}` : "risk: —"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function normalizeColor(input: string | null | undefined): string {
  if (!input) return "#7ee8a5";
  if (/^#[0-9a-fA-F]{6}$/.test(input)) return input;
  return "#7ee8a5";
}
