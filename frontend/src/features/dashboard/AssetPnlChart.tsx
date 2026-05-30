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
import type { AssetStats } from "../../lib/dashboard";
import { formatCurrency } from "../../lib";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function AssetPnlChart({ visibleAssets }: { visibleAssets: AssetStats[] }) {
  const colorPositive = useMemo(() => token("--risk-low", "#34d399"), []);
  const colorNegative = useMemo(() => token("--risk-high", "#fb7185"), []);

  if (visibleAssets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground my-2" data-testid="pnl-chart-empty">
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
        backgroundColor: sorted.map((s) => (s.pnl >= 0 ? colorPositive : colorNegative))
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
    <div className="max-w-[420px] mt-3.5" data-testid="pnl-chart">
      <Bar data={data} options={options} />
    </div>
  );
}
