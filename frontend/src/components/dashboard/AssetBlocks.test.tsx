import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetBlocks } from "./AssetBlocks";
import type { AssetStats } from "../../lib/dashboard";

function mkStat(asset: string, current: number, pnl: number, riskLevel: AssetStats["riskLevel"] = null): AssetStats {
  return {
    asset,
    buyTotal: current - pnl,
    pnl,
    current,
    allocationPct: 100,
    pnlPct: pnl !== 0 && current - pnl > 0 ? (pnl / (current - pnl)) * 100 : 0,
    color: "#abcdef",
    riskLevel
  };
}

describe("AssetBlocks", () => {
  test("renders empty state when no visible assets", () => {
    render(<AssetBlocks visibleAssets={[]} stylesMap={{}} onChangeStyle={() => {}} />);
    expect(screen.getByTestId("asset-blocks-empty")).toBeInTheDocument();
  });

  test("emits riskLevel cycle on pill click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AssetBlocks
        visibleAssets={[mkStat("ETF-A", 100, 10, null)]}
        stylesMap={{}}
        onChangeStyle={onChange}
      />
    );
    await user.click(screen.getByRole("button", { name: /Risk level for ETF-A/i }));
    expect(onChange).toHaveBeenCalledWith("ETF-A", { riskLevel: "low" });
  });

  test("emits colorHex change on color picker change", () => {
    const onChange = vi.fn();
    render(
      <AssetBlocks
        visibleAssets={[mkStat("ETF-A", 100, 10)]}
        stylesMap={{ "ETF-A": { colorHex: "#aabbcc", riskLevel: null } }}
        onChangeStyle={onChange}
      />
    );
    const input = screen.getByLabelText(/Color for ETF-A/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "#112233" } });
    expect(onChange).toHaveBeenCalledWith("ETF-A", { colorHex: "#112233" });
  });

  test("renders current PnL% with sign-driven class", () => {
    render(
      <AssetBlocks
        visibleAssets={[mkStat("DOWN", 80, -20)]}
        stylesMap={{}}
        onChangeStyle={() => {}}
      />
    );
    const block = screen.getByTestId("asset-block-DOWN");
    expect(block.querySelector(".asset-block__pnl--down")).toBeTruthy();
  });
});
