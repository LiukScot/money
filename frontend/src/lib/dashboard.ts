import type {
  RangeKey,
  RiskLevel,
  Snapshot,
  StylesMap,
  Transaction
} from "../types";
import { RISK_LEVELS } from "../types";

const FALLBACK_PALETTE = [
  "#5de2a5",
  "#7fc3ff",
  "#ffd57f",
  "#ff8da1",
  "#c6a3ff",
  "#9bd8ff"
];

export function fallbackColor(asset: string, index: number, styles: StylesMap | undefined): string {
  const fromStyle = styles?.[asset]?.colorHex;
  if (fromStyle) return fromStyle;
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length] ?? FALLBACK_PALETTE[0]!;
}

export type AssetStats = {
  asset: string;
  buyTotal: number;
  pnl: number;
  current: number;
  allocationPct: number;
  pnlPct: number;
  color: string;
  riskLevel: RiskLevel | null;
};

export function computePerAsset(
  transactions: readonly Transaction[],
  styles: StylesMap | undefined
): AssetStats[] {
  const map = new Map<string, { buy: number; pnl: number; current: number }>();
  for (const row of transactions) {
    const entry = map.get(row.asset) ?? { buy: 0, pnl: 0, current: 0 };
    entry.buy += row.buyValue;
    entry.pnl += row.pnl;
    entry.current += row.currentValue;
    map.set(row.asset, entry);
  }
  const totalCurrent = Array.from(map.values()).reduce((sum, v) => sum + v.current, 0);
  const assets = Array.from(map.keys());
  return assets.map((asset, index) => {
    const stats = map.get(asset)!;
    const allocationPct = totalCurrent > 0 ? (stats.current / totalCurrent) * 100 : 0;
    const pnlPct = stats.buy > 0 ? (stats.pnl / stats.buy) * 100 : 0;
    const rawRisk = styles?.[asset]?.riskLevel;
    const riskLevel = (RISK_LEVELS as readonly string[]).includes(rawRisk ?? "")
      ? (rawRisk as RiskLevel)
      : null;
    return {
      asset,
      buyTotal: stats.buy,
      pnl: stats.pnl,
      current: stats.current,
      allocationPct,
      pnlPct,
      color: fallbackColor(asset, index, styles),
      riskLevel
    };
  });
}

export function filterVisibleAssets(stats: readonly AssetStats[], showZero: boolean): AssetStats[] {
  if (showZero) return [...stats];
  return stats.filter((s) => Math.abs(s.current) > 0.0001);
}

export function cycleRisk(current: RiskLevel | null): RiskLevel {
  const idx = current ? RISK_LEVELS.indexOf(current) : -1;
  return RISK_LEVELS[(idx + 1) % RISK_LEVELS.length]!;
}

export function rangeCutoff(range: RangeKey, now: Date = new Date()): Date | null {
  if (range === "all") return null;
  const cutoff = new Date(now);
  if (range === "3m") cutoff.setMonth(cutoff.getMonth() - 3);
  else if (range === "6m") cutoff.setMonth(cutoff.getMonth() - 6);
  else if (range === "1y") cutoff.setFullYear(cutoff.getFullYear() - 1);
  else if (range === "3y") cutoff.setFullYear(cutoff.getFullYear() - 3);
  else if (range === "10y") cutoff.setFullYear(cutoff.getFullYear() - 10);
  return cutoff;
}

export function filterSnapshotsByRange(
  snapshots: readonly Snapshot[],
  range: RangeKey,
  now: Date = new Date()
): Snapshot[] {
  const cutoff = rangeCutoff(range, now);
  if (!cutoff) return [...snapshots];
  const cutoffMs = cutoff.getTime();
  return snapshots.filter((s) => {
    const t = new Date(s.snapshotDate).getTime();
    return Number.isFinite(t) && t >= cutoffMs;
  });
}

export function computeRiskTotals(stats: readonly AssetStats[]): {
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
} {
  return stats.reduce(
    (acc, s) => {
      if (s.riskLevel === "low") acc.lowRisk += s.current;
      else if (s.riskLevel === "medium") acc.mediumRisk += s.current;
      else if (s.riskLevel === "high") acc.highRisk += s.current;
      return acc;
    },
    { lowRisk: 0, mediumRisk: 0, highRisk: 0 }
  );
}

export function findLastTxDate(transactions: readonly Transaction[]): string | null {
  if (transactions.length === 0) return null;
  let latest: string | null = null;
  for (const row of transactions) {
    if (!row.txDate) continue;
    if (!latest || row.txDate > latest) latest = row.txDate;
  }
  return latest;
}

export function summarizeMonthlyReview(filtered: readonly Snapshot[]): {
  count: number;
  latestDate: string | null;
} {
  if (filtered.length === 0) return { count: 0, latestDate: null };
  const latest = filtered.reduce<string | null>((acc, s) => {
    if (!acc) return s.snapshotDate;
    return s.snapshotDate > acc ? s.snapshotDate : acc;
  }, null);
  return { count: filtered.length, latestDate: latest };
}
