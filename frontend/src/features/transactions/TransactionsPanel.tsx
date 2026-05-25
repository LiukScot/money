import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionForm } from "./TransactionForm";
import { TransactionsTable } from "./TransactionsTable";
import { useTransactionsQuery } from "./useTransactionsQuery";
import { useTxMutation } from "./useTxMutation";
import { useDeleteTransaction } from "./useDeleteTransaction";
import { txFormDefaults, type TxFormValues } from "./schemas";

export function TransactionsPanel() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const txQuery = useTransactionsQuery(true);

  const form = useForm<TxFormValues>({ defaultValues: txFormDefaults });

  const txMutation = useTxMutation(editingId, () => {
    setEditingId(null);
    form.reset(txFormDefaults);
  });
  const deleteMutation = useDeleteTransaction();

  const assetOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of txQuery.data ?? []) {
      if (row.asset) set.add(row.asset);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [txQuery.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <TransactionForm
          form={form}
          assetOptions={assetOptions}
          editingId={editingId}
          isSubmitting={txMutation.isPending}
          onSubmit={(values) => {
            if (txMutation.isPending) return;
            txMutation.mutate(values);
          }}
          onCancel={() => {
            setEditingId(null);
            form.reset(txFormDefaults);
          }}
        />
        <TransactionsTable
          rows={txQuery.data ?? []}
          onEdit={(row) => {
            setEditingId(row.id);
            form.reset({
              txDate: row.txDate,
              asset: row.asset,
              tipo: row.tipo,
              buyValue: row.buyValue,
              pnl: row.pnl,
              note: row.note
            });
          }}
          onDelete={(id) => {
            if (deleteMutation.isPending) return;
            deleteMutation.mutate(id);
          }}
        />
      </CardContent>
    </Card>
  );
}
