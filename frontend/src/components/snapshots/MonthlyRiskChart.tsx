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
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function MonthlyRiskChart({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <p className="dashboard-empty" data-testid="snapshot-chart-empty">
        No snapshots to chart.
      </p>
    );
  }
  const asc = [...snapshots].reverse();
  const data = {
    labels: asc.map((s) => s.snapshotDate),
    datasets: [
      { label: "Low", data: asc.map((s) => s.lowRisk), backgroundColor: token("--risk-low", "#7ee8a5") },
      { label: "Medium", data: asc.map((s) => s.mediumRisk), backgroundColor: token("--risk-medium", "#f9c777") },
      { label: "High", data: asc.map((s) => s.highRisk), backgroundColor: token("--risk-high", "#ff7b96") },
      { label: "Liquid", data: asc.map((s) => s.liquid), backgroundColor: token("--risk-liquid", "#74c0fc") }
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
    <div className="chart-wrap" data-testid="snapshot-chart">
      <Bar data={data} options={options} />
    </div>
  );
}
