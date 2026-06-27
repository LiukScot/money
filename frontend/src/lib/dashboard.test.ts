import { describe, expect, test } from "vitest";
import {
  computePerAsset,
  cycleRisk,
  filterVisibleAssets,
  findLastTxDate
} from "./dashboard";
import type { StylesMap, Transaction } from "../types";

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

describe("findLastTxDate", () => {
  test("returns null when empty", () => {
    expect(findLastTxDate([])).toBeNull();
  });

  test("returns first element date (assumes DESC order from API)", () => {
    // API returns transactions ORDER BY tx_date DESC, so first element = latest
    expect(findLastTxDate([tx("B", 1, 0, "2026-05-17"), tx("A", 1, 0, "2026-01-01")])).toBe(
      "2026-05-17"
    );
  });
});
