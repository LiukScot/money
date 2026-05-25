import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Pie } from "react-chartjs-2";
import type { AssetStats } from "../../lib/dashboard";

ChartJS.register(ArcElement, Tooltip, Legend);

export function AssetAllocationChart({ visibleAssets }: { visibleAssets: AssetStats[] }) {
  if (visibleAssets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground my-2" data-testid="allocation-chart-empty">
        No allocation data.
      </p>
    );
  }
  const data = {
    labels: visibleAssets.map((s) => s.asset),
    datasets: [
      {
        label: "Allocation",
        data: visibleAssets.map((s) => s.current),
        backgroundColor: visibleAssets.map((s) => s.color)
      }
    ]
  };
  return (
    <div className="max-w-[420px] mt-3.5" data-testid="allocation-chart">
      <Pie data={data} />
    </div>
  );
}
