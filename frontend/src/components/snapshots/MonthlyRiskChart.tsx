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

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function MonthlyRiskChart({ snapshots }: { snapshots: Snapshot[] }) {
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
      { label: "Low", data: asc.map((s) => s.lowRisk), backgroundColor: token("--risk-low", "#34d399") },
      { label: "Medium", data: asc.map((s) => s.mediumRisk), backgroundColor: token("--risk-medium", "#fbbf24") },
      { label: "High", data: asc.map((s) => s.highRisk), backgroundColor: token("--risk-high", "#fb7185") },
      { label: "Liquid", data: asc.map((s) => s.liquid), backgroundColor: token("--risk-liquid", "#60a5fa") }
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
