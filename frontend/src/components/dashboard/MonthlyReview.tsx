import { useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Legend,
  Tooltip
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { filterSnapshotsByRange, summarizeMonthlyReview } from "../../lib/dashboard";
import { RANGE_KEYS, RANGE_LABELS, type RangeKey, type Snapshot } from "../../types";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const RISK_COLORS = {
  lowRisk: "#74c0fc",
  mediumRisk: "#faa2c1",
  highRisk: "#e599f7",
  liquid: "#51cf66"
} as const;

export function MonthlyReview({ snapshots }: { snapshots: Snapshot[] }) {
  const [range, setRange] = useState<RangeKey>("1y");

  const filtered = useMemo(() => {
    const ordered = [...snapshots].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
    return filterSnapshotsByRange(ordered, range);
  }, [snapshots, range]);

  const summary = summarizeMonthlyReview(filtered);

  const data = {
    labels: filtered.map((s) => s.snapshotDate),
    datasets: [
      {
        label: "Low risk",
        data: filtered.map((s) => s.lowRisk),
        backgroundColor: RISK_COLORS.lowRisk,
        stack: "snap"
      },
      {
        label: "Medium risk",
        data: filtered.map((s) => s.mediumRisk),
        backgroundColor: RISK_COLORS.mediumRisk,
        stack: "snap"
      },
      {
        label: "High risk",
        data: filtered.map((s) => s.highRisk),
        backgroundColor: RISK_COLORS.highRisk,
        stack: "snap"
      },
      {
        label: "Liquid",
        data: filtered.map((s) => s.liquid),
        backgroundColor: RISK_COLORS.liquid,
        stack: "snap"
      }
    ]
  };

  const options = {
    scales: { x: { stacked: true }, y: { stacked: true } }
  };

  return (
    <section className="monthly-review" data-testid="monthly-review">
      <header className="monthly-review__head">
        <h3>Monthly review</h3>
        <p className="monthly-review__summary" data-testid="monthly-review-summary">
          {summary.count === 0
            ? "No snapshots yet"
            : `${summary.count} snapshot${summary.count === 1 ? "" : "s"} • latest: ${summary.latestDate}`}
        </p>
      </header>
      <div className="range-filter" role="group" aria-label="Date range filter">
        {RANGE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`range-filter__btn${range === key ? " range-filter__btn--active" : ""}`}
            onClick={() => setRange(key)}
            aria-pressed={range === key}
          >
            {RANGE_LABELS[key]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="dashboard-empty" data-testid="monthly-review-empty">
          No snapshots in this range.
        </p>
      ) : (
        <div className="chart-wrap chart-wrap--wide">
          <Bar data={data} options={options} />
        </div>
      )}
    </section>
  );
}
