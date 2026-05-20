import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({
  Bar: () => <div data-testid="bar-mock" />
}));

import { MonthlyRiskChart } from "./MonthlyRiskChart";
import type { Snapshot } from "../../types";

const sampleSnapshot: Snapshot = {
  id: "1",
  snapshotDate: "2026-05-01",
  lowRisk: 100,
  mediumRisk: 200,
  highRisk: 300,
  liquid: 400
};

describe("MonthlyRiskChart", () => {
  test("renders empty state when no snapshots", () => {
    render(<MonthlyRiskChart snapshots={[]} />);
    expect(screen.getByTestId("snapshot-chart-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("snapshot-chart")).not.toBeInTheDocument();
  });

  test("renders chart wrapper when snapshots provided", () => {
    render(<MonthlyRiskChart snapshots={[sampleSnapshot]} />);
    expect(screen.getByTestId("snapshot-chart")).toBeInTheDocument();
    expect(screen.getByTestId("bar-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("snapshot-chart-empty")).not.toBeInTheDocument();
  });
});
