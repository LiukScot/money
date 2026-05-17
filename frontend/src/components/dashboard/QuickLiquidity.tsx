import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import type { AssetStats } from "../../lib/dashboard";
import { computeRiskTotals } from "../../lib/dashboard";
import { apiEnvelopeSchema, apiFetch, formatCurrency } from "../../lib";

const quickResponse = apiEnvelopeSchema(
  z.object({ id: z.string(), snapshotDate: z.string() })
);

export function QuickLiquidity({ stats }: { stats: AssetStats[] }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const totals = computeRiskTotals(stats);

  const quickMutation = useMutation({
    mutationFn: async (liquid: number) =>
      apiFetch(
        "/api/v1/monthly-snapshots/quick",
        {
          method: "POST",
          body: JSON.stringify({ ...totals, liquid })
        },
        (raw) => quickResponse.parse(raw).data
      ),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      setValue("");
      setError(null);
      setSuccessMessage(`Snapshot for ${data.snapshotDate} saved.`);
    },
    onError: (err) => {
      setError((err as Error).message);
      setSuccessMessage(null);
    }
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setError("Enter a valid number");
      setSuccessMessage(null);
      return;
    }
    quickMutation.mutate(parsed);
  };

  return (
    <section className="quick-liquidity" data-testid="quick-liquidity">
      <h3>Quick liquidity snapshot</h3>
      <p className="quick-liquidity__hint">
        Captures today&apos;s risk totals from your transactions plus the liquidity figure below.
      </p>
      <ul className="quick-liquidity__totals" data-testid="quick-liquidity-totals">
        <li>Low: {formatCurrency(totals.lowRisk)}</li>
        <li>Medium: {formatCurrency(totals.mediumRisk)}</li>
        <li>High: {formatCurrency(totals.highRisk)}</li>
      </ul>
      <form className="quick-liquidity__form" onSubmit={submit}>
        <label>
          Liquidity today
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0.00"
            data-testid="quick-liquidity-input"
          />
        </label>
        <button type="submit" disabled={quickMutation.isPending} data-testid="quick-liquidity-submit">
          {quickMutation.isPending ? "Saving..." : "Add today snapshot"}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {successMessage && (
        <p className="hint" data-testid="quick-liquidity-success">
          {successMessage}
        </p>
      )}
    </section>
  );
}
