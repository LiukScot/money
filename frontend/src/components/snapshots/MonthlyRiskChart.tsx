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
      { label: "low", data: asc.map((s) => s.lowRisk), backgroundColor: "#74c0fc" },
      { label: "medium", data: asc.map((s) => s.mediumRisk), backgroundColor: "#faa2c1" },
      { label: "high", data: asc.map((s) => s.highRisk), backgroundColor: "#e599f7" },
      { label: "liquid", data: asc.map((s) => s.liquid), backgroundColor: "#51cf66" }
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
