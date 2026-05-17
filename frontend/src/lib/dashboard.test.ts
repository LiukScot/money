import { describe, expect, test } from "vitest";
import {
  computePerAsset,
  computeRiskTotals,
  cycleRisk,
  filterSnapshotsByRange,
  filterVisibleAssets,
  findLastTxDate,
  rangeCutoff,
  summarizeMonthlyReview
} from "./dashboard";
import type { Snapshot, StylesMap, Transaction } from "../types";

function tx(asset: string, buy: number, pnl: number, txDate = "2026-05-01"): Transaction {
  return {
    id: `tx-${asset}-${buy}-${pnl}`,
    txDate,
    asset,
    tipo: "nuovo vincolo",
    derivedType: "buy",
    buyValue: buy,
    pnl,
    currentValue: buy + pnl,
    note: ""
  };
}

function snap(snapshotDate: string): Snapshot {
  return {
    id: `s-${snapshotDate}`,
    snapshotDate,
    lowRisk: 1,
    mediumRisk: 1,
    highRisk: 1,
    liquid: 1
  };
}

describe("computePerAsset", () => {
  test("aggregates per asset and computes allocation/pnl %", () => {
    const stats = computePerAsset([tx("A", 100, 10), tx("A", 100, 20), tx("B", 200, -50)], {});
    const a = stats.find((s) => s.asset === "A")!;
    const b = stats.find((s) => s.asset === "B")!;
    expect(a.buyTotal).toBe(200);
    expect(a.pnl).toBe(30);
    expect(a.current).toBe(230);
    expect(a.pnlPct).toBeCloseTo(15, 5);
    expect(b.pnl).toBe(-50);
    expect(b.pnlPct).toBeCloseTo(-25, 5);
    const totalCurrent = a.current + b.current;
    expect(a.allocationPct).toBeCloseTo((a.current / totalCurrent) * 100, 5);
  });

  test("returns 0 allocation/pnl % when totals are zero", () => {
    const stats = computePerAsset([tx("A", 0, 0)], {});
    expect(stats[0]?.allocationPct).toBe(0);
    expect(stats[0]?.pnlPct).toBe(0);
  });

  test("maps risk level only for valid values", () => {
    const styles: StylesMap = {
      A: { colorHex: null, riskLevel: "low" },
      B: { colorHex: null, riskLevel: "bogus" },
      C: { colorHex: null, riskLevel: null }
    };
    const stats = computePerAsset([tx("A", 1, 0), tx("B", 1, 0), tx("C", 1, 0)], styles);
    expect(stats.find((s) => s.asset === "A")?.riskLevel).toBe("low");
    expect(stats.find((s) => s.asset === "B")?.riskLevel).toBeNull();
    expect(stats.find((s) => s.asset === "C")?.riskLevel).toBeNull();
  });

  test("uses styles colorHex when present", () => {
    const styles: StylesMap = { A: { colorHex: "#abcdef", riskLevel: null } };
    const stats = computePerAsset([tx("A", 1, 0)], styles);
    expect(stats[0]?.color).toBe("#abcdef");
  });
});

describe("filterVisibleAssets", () => {
  test("hides zero-current assets by default", () => {
    const stats = computePerAsset([tx("A", 100, 10), tx("B", 0, 0)], {});
    expect(filterVisibleAssets(stats, false).map((s) => s.asset)).toEqual(["A"]);
  });

  test("shows zero-current assets when showZero=true", () => {
    const stats = computePerAsset([tx("A", 100, 10), tx("B", 0, 0)], {});
    expect(filterVisibleAssets(stats, true).map((s) => s.asset)).toEqual(["A", "B"]);
  });
});

describe("cycleRisk", () => {
  test("cycles low → medium → high → low", () => {
    expect(cycleRisk(null)).toBe("low");
    expect(cycleRisk("low")).toBe("medium");
    expect(cycleRisk("medium")).toBe("high");
    expect(cycleRisk("high")).toBe("low");
  });
});

describe("rangeCutoff", () => {
  test("returns null for 'all'", () => {
    expect(rangeCutoff("all")).toBeNull();
  });

  test("subtracts months/years correctly", () => {
    const now = new Date("2026-06-30T12:00:00Z");
    expect(rangeCutoff("3m", now)?.toISOString().slice(0, 10)).toBe("2026-03-30");
    expect(rangeCutoff("1y", now)?.toISOString().slice(0, 10)).toBe("2025-06-30");
    expect(rangeCutoff("10y", now)?.toISOString().slice(0, 10)).toBe("2016-06-30");
  });
});

describe("filterSnapshotsByRange", () => {
  const list = [snap("2024-01-15"), snap("2025-12-01"), snap("2026-05-01"), snap("2026-06-01")];
  const now = new Date("2026-06-15T00:00:00Z");

  test("'all' returns full list", () => {
    expect(filterSnapshotsByRange(list, "all", now)).toHaveLength(4);
  });

  test("'3m' keeps only recent", () => {
    const out = filterSnapshotsByRange(list, "3m", now).map((s) => s.snapshotDate);
    expect(out).toEqual(["2026-05-01", "2026-06-01"]);
  });

  test("'1y' keeps last year", () => {
    const out = filterSnapshotsByRange(list, "1y", now).map((s) => s.snapshotDate);
    expect(out).toEqual(["2025-12-01", "2026-05-01", "2026-06-01"]);
  });

  test("ignores invalid date strings", () => {
    const broken = [...list, { ...snap("not-a-date") }];
    expect(filterSnapshotsByRange(broken, "10y", now)).toHaveLength(4);
  });
});

describe("computeRiskTotals", () => {
  test("sums current values by risk level, ignores null/liquid", () => {
    const styles: StylesMap = {
      A: { colorHex: null, riskLevel: "low" },
      B: { colorHex: null, riskLevel: "medium" },
      C: { colorHex: null, riskLevel: "high" },
      D: { colorHex: null, riskLevel: null }
    };
    const stats = computePerAsset(
      [tx("A", 100, 0), tx("B", 200, 0), tx("C", 300, 0), tx("D", 50, 0)],
      styles
    );
    const totals = computeRiskTotals(stats);
    expect(totals).toEqual({ lowRisk: 100, mediumRisk: 200, highRisk: 300 });
  });
});

describe("findLastTxDate", () => {
  test("returns null when empty", () => {
    expect(findLastTxDate([])).toBeNull();
  });

  test("returns max ISO date string", () => {
    expect(findLastTxDate([tx("A", 1, 0, "2026-01-01"), tx("B", 1, 0, "2026-05-17")])).toBe(
      "2026-05-17"
    );
  });
});

describe("summarizeMonthlyReview", () => {
  test("zero count + null when empty", () => {
    expect(summarizeMonthlyReview([])).toEqual({ count: 0, latestDate: null });
  });

  test("count + latest date over filtered set", () => {
    const out = summarizeMonthlyReview([snap("2025-12-01"), snap("2026-05-01"), snap("2026-03-01")]);
    expect(out).toEqual({ count: 3, latestDate: "2026-05-01" });
  });
});
