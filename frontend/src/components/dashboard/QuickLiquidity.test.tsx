import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-chartjs-2", () => ({
  Pie: () => null,
  Bar: () => null,
  Line: () => null,
  Doughnut: () => null
}));

import { QuickLiquidity } from "./QuickLiquidity";
import { resetTestState, testState } from "../../test-msw";
import type { AssetStats } from "../../lib/dashboard";

function withClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function stat(asset: string, current: number, riskLevel: AssetStats["riskLevel"]): AssetStats {
  return {
    asset,
    buyTotal: current,
    pnl: 0,
    current,
    allocationPct: 100,
    pnlPct: 0,
    color: "#7ee8a5",
    riskLevel
  };
}

beforeEach(() => {
  resetTestState();
});

describe("QuickLiquidity", () => {
  test("submits totals derived from stats plus user liquidity", async () => {
    const user = userEvent.setup();
    withClient(
      <QuickLiquidity
        stats={[stat("A", 1000, "low"), stat("B", 500, "medium"), stat("C", 200, "high")]}
      />
    );
    await user.type(screen.getByTestId("quick-liquidity-input"), "300");
    await user.click(screen.getByTestId("quick-liquidity-submit"));

    await waitFor(() => {
      expect(testState.snapshots).toHaveLength(1);
    });
    const today = new Date().toISOString().slice(0, 10);
    expect(testState.snapshots[0]).toMatchObject({
      snapshotDate: today,
      lowRisk: 1000,
      mediumRisk: 500,
      highRisk: 200,
      liquid: 300
    });
  });

  test("second submit overwrites today snapshot (dedupe)", async () => {
    const user = userEvent.setup();
    withClient(<QuickLiquidity stats={[stat("A", 1000, "low")]} />);
    await user.type(screen.getByTestId("quick-liquidity-input"), "50");
    await user.click(screen.getByTestId("quick-liquidity-submit"));
    await waitFor(() => expect(testState.snapshots).toHaveLength(1));

    await user.clear(screen.getByTestId("quick-liquidity-input"));
    await user.type(screen.getByTestId("quick-liquidity-input"), "777");
    await user.click(screen.getByTestId("quick-liquidity-submit"));
    await waitFor(() => expect(testState.snapshots[0]?.liquid).toBe(777));
    expect(testState.snapshots).toHaveLength(1);
  });

  test("displays computed totals from incoming stats", () => {
    withClient(
      <QuickLiquidity
        stats={[stat("A", 1000, "low"), stat("B", 500, "medium"), stat("C", 200, "high")]}
      />
    );
    const list = screen.getByTestId("quick-liquidity-totals");
    expect(list.textContent).toMatch(/Low:/);
    expect(list.textContent).toMatch(/Medium:/);
    expect(list.textContent).toMatch(/High:/);
  });
});
