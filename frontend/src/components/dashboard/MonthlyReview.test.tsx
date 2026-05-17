import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-chartjs-2", () => ({
  Pie: () => null,
  Bar: () => null,
  Line: () => null,
  Doughnut: () => null
}));

import { MonthlyReview } from "./MonthlyReview";
import type { Snapshot } from "../../types";

function snap(date: string): Snapshot {
  return { id: `s-${date}`, snapshotDate: date, lowRisk: 1, mediumRisk: 1, highRisk: 1, liquid: 1 };
}

describe("MonthlyReview", () => {
  test("renders empty hint when no snapshots", () => {
    render(<MonthlyReview snapshots={[]} />);
    expect(screen.getByText(/no snapshots yet/i)).toBeInTheDocument();
    expect(screen.getByTestId("monthly-review-empty")).toBeInTheDocument();
  });

  test("default range '1y' filters older snapshots out of summary", () => {
    const oneYearAgoPlus = new Date();
    oneYearAgoPlus.setFullYear(oneYearAgoPlus.getFullYear() - 2);
    const inRange = new Date();
    inRange.setMonth(inRange.getMonth() - 1);
    const recent = inRange.toISOString().slice(0, 10);
    render(<MonthlyReview snapshots={[snap(oneYearAgoPlus.toISOString().slice(0, 10)), snap(recent)]} />);
    expect(screen.getByTestId("monthly-review-summary").textContent).toMatch(/1 snapshot/);
  });

  test("switching to 'all' surfaces every snapshot", async () => {
    const user = userEvent.setup();
    const oldDate = "2020-01-01";
    const newDate = "2026-05-01";
    render(<MonthlyReview snapshots={[snap(oldDate), snap(newDate)]} />);
    await user.click(screen.getByRole("button", { name: /since beginning/i }));
    expect(screen.getByTestId("monthly-review-summary").textContent).toMatch(/2 snapshots/);
  });
});
