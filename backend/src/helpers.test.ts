import { describe, expect, test } from "bun:test";
import { inferType, makeId, normalizeTx, normalizeMm, normalizeSnap } from "./helpers.ts";

describe("inferType", () => {
  test("nuovo vincolo + positive buyValue → buy", () => {
    expect(inferType("nuovo vincolo", 100, 0)).toBe("buy");
  });

  test("nuovo vincolo + negative buyValue → sell", () => {
    expect(inferType("nuovo vincolo", -100, 0)).toBe("sell");
  });

  test("cedola + positive pnl → return", () => {
    expect(inferType("cedola", 0, 50)).toBe("return");
  });

  test("interessi + negative pnl → fee", () => {
    expect(inferType("interessi", 0, -10)).toBe("fee");
  });

  test("cashback + positive pnl → return", () => {
    expect(inferType("cashback", 0, 5)).toBe("return");
  });

  test("Variazione Valore + positive → value-up", () => {
    expect(inferType("Variazione Valore", 0, 100)).toBe("value-up");
  });

  test("Variazione Valore + negative → value-down", () => {
    expect(inferType("Variazione Valore", 0, -50)).toBe("value-down");
  });

  test("unknown tipo + positive buy positive pnl → buy", () => {
    expect(inferType("other", 100, 10)).toBe("buy");
  });

  test("unknown tipo + positive buy negative pnl → buy-loss", () => {
    expect(inferType("other", 100, -10)).toBe("buy-loss");
  });

  test("unknown tipo + negative buy positive pnl → sell", () => {
    expect(inferType("other", -100, 10)).toBe("sell");
  });

  test("unknown tipo + negative buy negative pnl → sell-loss", () => {
    expect(inferType("other", -100, -10)).toBe("sell-loss");
  });
});

describe("makeId", () => {
  test("uses prefix and produces unique values", () => {
    const a = makeId("tx");
    const b = makeId("tx");
    expect(a).toMatch(/^tx-/);
    expect(b).toMatch(/^tx-/);
    expect(a).not.toBe(b);
  });
});

describe("normalize functions map snake_case → camelCase", () => {
  test("normalizeTx", () => {
    const result = normalizeTx({
      id: "tx-1",
      tx_date: "2026-05-16",
      asset: "ETF-A",
      tipo: "nuovo vincolo",
      derived_type: "buy",
      buy_value: 100,
      pnl: 10,
      current_value: 110,
      note: null,
      created_at: "2026-05-16T00:00:00",
      updated_at: "2026-05-16T00:00:00"
    });
    expect(result.txDate).toBe("2026-05-16");
    expect(result.derivedType).toBe("buy");
    expect(result.buyValue).toBe(100);
    expect(result.note).toBe("");
  });

  test("normalizeMm", () => {
    const result = normalizeMm({
      id: "mm-1",
      name: "Salary",
      direction: "income",
      amount: 3000,
      note: null,
      created_at: "x",
      updated_at: "y"
    });
    expect(result.direction).toBe("income");
    expect(result.note).toBe("");
  });

  test("normalizeSnap", () => {
    const result = normalizeSnap({
      id: "snap-1",
      snapshot_date: "2026-05-31",
      low_risk: 1,
      medium_risk: 2,
      high_risk: 3,
      liquid: 4,
      created_at: "x",
      updated_at: "y"
    });
    expect(result.snapshotDate).toBe("2026-05-31");
    expect(result.lowRisk).toBe(1);
    expect(result.liquid).toBe(4);
  });
});
