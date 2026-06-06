import { useMemo } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Legend,
  Tooltip
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { formatCurrency } from "../../lib";
import type { Snapshot } from "../../types";
import { cssToken } from "../../lib/cssToken";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export function MonthlyRiskChart({ snapshots }: { snapshots: Snapshot[] }) {
  const colorLow = useMemo(() => cssToken("--risk-low", "#34d399"), []);
  const colorMedium = useMemo(() => cssToken("--risk-medium", "#fbbf24"), []);
  const colorHigh = useMemo(() => cssToken("--risk-high", "#fb7185"), []);
  const colorLiquid = useMemo(() => cssToken("--risk-liquid", "#60a5fa"), []);

  if (snapshots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground my-2" data-testid="snapshot-chart-empty">
        No snapshots to chart.
      </p>
    );
  }
  const asc = [...snapshots].reverse();
  const data = {
    labels: asc.map((s) => s.snapshotDate),
    datasets: [
      { label: "Low", data: asc.map((s) => s.lowRisk), backgroundColor: colorLow },
      { label: "Medium", data: asc.map((s) => s.mediumRisk), backgroundColor: colorMedium },
      { label: "High", data: asc.map((s) => s.highRisk), backgroundColor: colorHigh },
      { label: "Liquid", data: asc.map((s) => s.liquid), backgroundColor: colorLiquid }
    ]
  };
  const options = {
    plugins: { legend: { position: "bottom" as const } },
    scales: {
      x: { stacked: true },
      y: {
        stacked: true,
        ticks: {
          callback: (value: string | number) => formatCurrency(Number(value))
        }
      }
    }
  };
  return (
    <div className="max-w-[420px] mt-3.5" data-testid="snapshot-chart">
      <Bar data={data} options={options} />
    </div>
  );
}
