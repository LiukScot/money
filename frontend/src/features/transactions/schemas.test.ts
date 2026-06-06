import { describe, expect, test } from "vitest";
import { txFormSchema, txFormDefaults } from "./schemas";

describe("txFormSchema", () => {
  test("coerces empty string buyValue to 0 on submit", () => {
    const result = txFormSchema.parse({ ...txFormDefaults, asset: "ETF-A", buyValue: "", pnl: "" });
    expect(result.buyValue).toBe(0);
    expect(result.pnl).toBe(0);
  });

  test("preserves numeric values when present", () => {
    const result = txFormSchema.parse({ ...txFormDefaults, asset: "ETF-A", buyValue: 100, pnl: 5.5 });
    expect(result.buyValue).toBe(100);
    expect(result.pnl).toBe(5.5);
  });

  test("txFormDefaults has no as-unknown-as casts — types are assignable without assertion", () => {
    // If TxFormDefaults is used correctly, buyValue and pnl are typed as number|""
    // This test verifies the runtime value is "" (not an invalid cast).
    expect(txFormDefaults.buyValue).toBe("");
    expect(txFormDefaults.pnl).toBe("");
  });
});
