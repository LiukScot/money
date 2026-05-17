import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Legend,
  Tooltip
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { AssetStats } from "../../lib/dashboard";
import { formatCurrency } from "../../lib";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export function AssetPnlChart({ visibleAssets }: { visibleAssets: AssetStats[] }) {
  if (visibleAssets.length === 0) {
    return (
      <p className="dashboard-empty" data-testid="pnl-chart-empty">
        No PnL data to chart.
      </p>
    );
  }
  const sorted = [...visibleAssets].sort((a, b) => b.pnl - a.pnl);
  const data = {
    labels: sorted.map((s) => s.asset),
    datasets: [
      {
        label: "PnL",
        data: sorted.map((s) => s.pnl),
        backgroundColor: sorted.map((s) => (s.pnl >= 0 ? "#7ee8a5" : "#ff7b96"))
      }
    ]
  };
  const options = {
    plugins: { legend: { display: false } },
    scales: {
      y: {
        ticks: {
          callback: (value: string | number) => formatCurrency(Number(value))
        }
      }
    }
  };
  return (
    <div className="chart-wrap" data-testid="pnl-chart">
      <Bar data={data} options={options} />
    </div>
  );
}
