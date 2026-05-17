import { formatCurrency } from "../../lib";

export type DashboardKpis = {
  totalInvested: number;
  totalPnl: number;
  assetsCount: number;
  txCount: number;
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyNet: number;
  lastTxDate: string | null;
};

export function KpiCards({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="stats-grid">
      <article>
        <h3>Total invested</h3>
        <strong>{formatCurrency(kpis.totalInvested)}</strong>
      </article>
      <article>
        <h3>Total PnL</h3>
        <strong>{formatCurrency(kpis.totalPnl)}</strong>
      </article>
      <article>
        <h3>Assets</h3>
        <strong>{kpis.assetsCount}</strong>
      </article>
      <article>
        <h3>Transactions</h3>
        <strong>{kpis.txCount}</strong>
      </article>
      <article>
        <h3>Monthly income</h3>
        <strong>{formatCurrency(kpis.monthlyIncome)}</strong>
      </article>
      <article>
        <h3>Monthly expense</h3>
        <strong>{formatCurrency(kpis.monthlyExpense)}</strong>
      </article>
      <article>
        <h3>Monthly net</h3>
        <strong>{formatCurrency(kpis.monthlyNet)}</strong>
      </article>
      <article>
        <h3>Last transaction</h3>
        <strong data-testid="kpi-last-tx-date">{kpis.lastTxDate ?? "—"}</strong>
      </article>
    </div>
  );
}
