import { useCallback } from "react";
import type { AssetStats } from "../../lib/dashboard";
import { cycleRisk, DEFAULT_COLOR } from "../../lib/dashboard";
import { formatCurrency } from "../../lib";
import type { RiskLevel, StylesMap } from "../../types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

type Props = {
  visibleAssets: AssetStats[];
  stylesMap: StylesMap | undefined;
  onChangeStyle: (asset: string, patch: { colorHex?: string | null; riskLevel?: RiskLevel | null }) => void;
};

const RISK_BADGE_CLASS: Record<RiskLevel | "none", string> = {
  low: "border-emerald-500/50 text-emerald-300 bg-emerald-500/10",
  medium: "border-amber-500/50 text-amber-300 bg-amber-500/10",
  high: "border-rose-500/50 text-rose-300 bg-rose-500/10",
  none: "border-border text-muted-foreground bg-muted/30"
};

export function AssetBlocks({ visibleAssets, stylesMap, onChangeStyle }: Props) {
  const handleColor = useCallback(
    (asset: string, value: string) => onChangeStyle(asset, { colorHex: value }),
    [onChangeStyle]
  );

  if (visibleAssets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground my-2" data-testid="asset-blocks-empty">
        No assets to show. Add a transaction or toggle &quot;Show zero-value assets&quot;.
      </p>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] mt-3">
      {visibleAssets.map((stat) => {
        const currentRisk = stat.riskLevel;
        const styleEntry = stylesMap?.[stat.asset];
        const colorValue = styleEntry?.colorHex ?? stat.color;
        const pnlClass = stat.pnl >= 0 ? "text-emerald-400" : "text-rose-400";
        const pnlDir = stat.pnl >= 0 ? "up" : "down";
        const riskKey = (currentRisk ?? "none") as RiskLevel | "none";
        return (
          <Card key={stat.asset} className="gap-2.5 p-3.5" data-testid={`asset-block-${stat.asset}`}>
            <header className="flex items-center gap-2.5">
              <span
                className="size-3.5 rounded-sm border border-border shrink-0"
                style={{ background: normalizeColor(colorValue) }}
                aria-hidden
              />
              <h3 className="m-0 text-base font-medium">{stat.asset}</h3>
            </header>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 m-0">
              <div className="grid gap-0.5">
                <dt className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">Current</dt>
                <dd className="m-0 text-sm">{formatCurrency(stat.current)}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">Allocation</dt>
                <dd className="m-0 text-sm">{stat.allocationPct.toFixed(1)}%</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">PnL</dt>
                <dd className={`m-0 text-sm ${pnlClass}`} data-pnl={pnlDir}>{formatCurrency(stat.pnl)}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">PnL %</dt>
                <dd className={`m-0 text-sm ${pnlClass}`} data-pnl={pnlDir}>{stat.pnlPct.toFixed(2)}%</dd>
              </div>
            </dl>
            <div className="flex items-center gap-2 flex-wrap">
              <Label
                htmlFor={`asset-color-${stat.asset}`}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"
              >
                Color
                <input
                  id={`asset-color-${stat.asset}`}
                  name={`asset-color-${stat.asset}`}
                  type="color"
                  aria-label={`Color for ${stat.asset}`}
                  value={normalizeColor(colorValue)}
                  onChange={(e) => handleColor(stat.asset, e.target.value)}
                  className="size-7 cursor-pointer rounded-md border border-border bg-transparent p-0"
                />
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto p-0"
                onClick={() => onChangeStyle(stat.asset, { riskLevel: cycleRisk(currentRisk) })}
                aria-label={`Risk level for ${stat.asset}`}
              >
                <Badge variant="outline" className={`lowercase ${RISK_BADGE_CLASS[riskKey]}`}>
                  {currentRisk ? `risk: ${currentRisk}` : "risk: —"}
                </Badge>
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function normalizeColor(input: string | null | undefined): string {
  if (!input) return DEFAULT_COLOR;
  if (/^#[0-9a-fA-F]{6}$/.test(input)) return input;
  return DEFAULT_COLOR;
}
