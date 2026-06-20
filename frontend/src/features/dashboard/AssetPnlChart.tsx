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
import { cssToken } from "../../lib/cssToken";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export function AssetPnlChart({ visibleAssets }: { visibleAssets: AssetStats[] }) {
  const colorPositive = useMemo(() => cssToken("--risk-low", "#34d399"), []);
  const colorNegative = useMemo(() => cssToken("--risk-high", "#fb7185"), []);

  const data = useMemo(() => {
    const sorted = [...visibleAssets].sort((a, b) => b.pnl - a.pnl);
    return {
      labels: sorted.map((s) => s.asset),
      datasets: [
        {
          label: "PnL",
          data: sorted.map((s) => s.pnl),
          backgroundColor: sorted.map((s) => (s.pnl >= 0 ? colorPositive : colorNegative))
        }
      ]
    };
  }, [visibleAssets, colorPositive, colorNegative]);

  const options = useMemo(() => ({
    plugins: { legend: { display: false } },
    scales: {
      y: {
        ticks: {
          callback: (value: string | number) => formatCurrency(Number(value))
        }
      }
    }
  }), []);

  if (visibleAssets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground my-2" data-testid="pnl-chart-empty">
        No PnL data to chart.
      </p>
    );
  }
  return (
    <div className="max-w-[420px] mt-3.5" data-testid="pnl-chart">
      <Bar data={data} options={options} />
    </div>
  );
}
