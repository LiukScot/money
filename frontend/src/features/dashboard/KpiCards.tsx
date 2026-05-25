import { formatCurrency, formatShortDate } from "../../lib";
import { Card, CardContent } from "@/components/ui/card";

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

function Kpi({ label, value, extra }: { label: string; value: React.ReactNode; extra?: Record<string, string> }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4 grid gap-1">
        <h3 className="m-0 text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</h3>
        <strong className="text-xl font-semibold" {...extra}>
          {value}
        </strong>
      </CardContent>
    </Card>
  );
}

export function KpiCards({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      <Kpi label="Total invested" value={formatCurrency(kpis.totalInvested)} />
      <Kpi label="Total PnL" value={formatCurrency(kpis.totalPnl)} />
      <Kpi label="Assets" value={kpis.assetsCount} />
      <Kpi label="Transactions" value={kpis.txCount} />
      <Kpi label="Monthly income" value={formatCurrency(kpis.monthlyIncome)} />
      <Kpi label="Monthly expense" value={formatCurrency(kpis.monthlyExpense)} />
      <Kpi label="Monthly net" value={formatCurrency(kpis.monthlyNet)} />
      <Kpi
        label="Last transaction"
        value={formatShortDate(kpis.lastTxDate)}
        extra={{ "data-testid": "kpi-last-tx-date", "data-raw-date": kpis.lastTxDate ?? "" }}
      />
    </div>
  );
}
