import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch } from "../../lib";
import { z } from "zod";
import {
  mmListResponse,
  prefsResponse,
  stylesResponse,
  type Movement,
  type Preferences,
  type RiskLevel,
  type StylesMap,
  type Transaction,
  txListResponse
} from "../../types";
import { computePerAsset, filterVisibleAssets, findLastTxDate } from "../../lib/dashboard";
import { KpiCards } from "./KpiCards";
import { AssetBlocks } from "./AssetBlocks";
import { AssetAllocationChart } from "./AssetAllocationChart";
import { AssetPnlChart } from "./AssetPnlChart";
import { ZeroAssetsToggle } from "./ZeroAssetsToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const okSchema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));

export function DashboardPanel() {
  const queryClient = useQueryClient();

  const txQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: async ({ signal }) =>
      apiFetch("/api/v1/transactions", { method: "GET", signal }, (raw) => txListResponse.parse(raw).data)
  });

  const mmQuery = useQuery({
    queryKey: ["movements"],
    queryFn: async ({ signal }) =>
      apiFetch("/api/v1/monthly-movements", { method: "GET", signal }, (raw) =>
        mmListResponse.parse(raw).data
      )
  });

  const stylesQuery = useQuery({
    queryKey: ["styles"],
    queryFn: async ({ signal }) =>
      apiFetch("/api/v1/assets/styles", { method: "GET", signal }, (raw) =>
        stylesResponse.parse(raw).data
      )
  });

  const prefsQuery = useQuery({
    queryKey: ["prefs"],
    queryFn: async ({ signal }) =>
      apiFetch("/api/v1/preferences", { method: "GET", signal }, (raw) =>
        prefsResponse.parse(raw).data
      )
  });

  const stylesMutation = useMutation({
    mutationFn: async (styles: StylesMap) =>
      apiFetch(
        "/api/v1/assets/styles",
        { method: "PUT", body: JSON.stringify({ styles }) },
        (raw) => okSchema.parse(raw).data
      ),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["styles"] });
      const previous = queryClient.getQueryData<StylesMap>(["styles"]);
      queryClient.setQueryData<StylesMap>(["styles"], next);
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["styles"], ctx.previous);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["styles"] });
    }
  });

  const prefsMutation = useMutation({
    mutationFn: async (showZeroAssets: boolean) =>
      apiFetch(
        "/api/v1/preferences",
        { method: "PUT", body: JSON.stringify({ showZeroAssets }) },
        (raw) => okSchema.parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prefs"] });
    }
  });

  const transactions: Transaction[] = txQuery.data ?? [];
  const movements: Movement[] = mmQuery.data ?? [];
  const stylesMap: StylesMap = stylesQuery.data ?? {};
  const prefs: Preferences = prefsQuery.data ?? { showZeroAssets: false, updatedAt: null };

  const allStats = useMemo(() => computePerAsset(transactions, stylesMap), [transactions, stylesMap]);
  const visibleAssets = useMemo(
    () => filterVisibleAssets(allStats, prefs.showZeroAssets),
    [allStats, prefs.showZeroAssets]
  );

  const kpis = useMemo(() => {
    const { income, expense } = movements.reduce(
      (acc, row) => {
        if (row.direction === "income") acc.income += row.amount;
        else acc.expense += row.amount;
        return acc;
      },
      { income: 0, expense: 0 }
    );
    return {
      totalInvested: transactions.reduce((sum, row) => sum + row.currentValue, 0),
      totalPnl: transactions.reduce((sum, row) => sum + row.pnl, 0),
      assetsCount: new Set(transactions.map((row) => row.asset)).size,
      txCount: transactions.length,
      monthlyIncome: income,
      monthlyExpense: expense,
      monthlyNet: income - expense,
      lastTxDate: findLastTxDate(transactions)
    };
  }, [transactions, movements]);

  const handleStyleChange = useCallback(
    (asset: string, patch: { colorHex?: string | null; riskLevel?: RiskLevel | null }) => {
      const latest = queryClient.getQueryData<StylesMap>(["styles"]) ?? stylesMap;
      const current = latest[asset] ?? { colorHex: null, riskLevel: null };
      const next: StylesMap = {
        ...latest,
        [asset]: {
          colorHex: "colorHex" in patch ? (patch.colorHex ?? null) : current.colorHex,
          riskLevel: "riskLevel" in patch ? (patch.riskLevel ?? null) : current.riskLevel
        }
      };
      stylesMutation.mutate(next);
    },
    [queryClient, stylesMap, stylesMutation]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <KpiCards kpis={kpis} />

        <div className="flex gap-3 items-center flex-wrap">
          <ZeroAssetsToggle
            checked={prefs.showZeroAssets}
            onChange={(next) => prefsMutation.mutate(next)}
            disabled={prefsMutation.isPending}
          />
        </div>

        <div className="grid gap-3">
          <h3 className="text-base font-medium m-0">Asset breakdown</h3>
          <AssetBlocks visibleAssets={visibleAssets} stylesMap={stylesMap} onChangeStyle={handleStyleChange} />
        </div>

        <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
          <div>
            <h3 className="text-base font-medium m-0 mb-2">Allocation</h3>
            <AssetAllocationChart visibleAssets={visibleAssets} />
          </div>
          <div>
            <h3 className="text-base font-medium m-0 mb-2">PnL per asset</h3>
            <AssetPnlChart visibleAssets={visibleAssets} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
