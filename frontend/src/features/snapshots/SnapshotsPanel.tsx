import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import { stylesResponse, txSchema } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyRiskChart } from "./MonthlyRiskChart";
import { SnapshotForm } from "./SnapshotForm";
import { SnapshotsTable } from "./SnapshotsTable";
import { useSnapshotsQuery } from "./useSnapshotsQuery";
import { useSnapMutation } from "./useSnapMutation";
import { useDeleteSnapshot } from "./useDeleteSnapshot";
import { type SnapFormValues } from "./schemas";

const snapDefaults: SnapFormValues = {
  snapshotDate: new Date().toISOString().slice(0, 10),
  // empty string renders placeholder in number input; z.coerce.number maps "" → 0 at submit
  liquid: "" as unknown as number
};

export function SnapshotsPanel() {
  const snapQuery = useSnapshotsQuery(true);

  // Keep tx + styles caches warm so useSnapMutation can derive risk totals
  // and so the Add button only enables once both are ready.
  const txQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: async () =>
      apiFetch("/api/v1/transactions", { method: "GET" }, (raw) =>
        apiEnvelopeSchema(z.array(txSchema)).parse(raw).data
      )
  });
  const stylesQuery = useQuery({
    queryKey: ["styles"],
    queryFn: async () =>
      apiFetch("/api/v1/assets/styles", { method: "GET" }, (raw) => stylesResponse.parse(raw).data)
  });

  const form = useForm<SnapFormValues>({
    defaultValues: { ...snapDefaults }
  });

  const snapMutation = useSnapMutation(() => {
    form.reset({ snapshotDate: new Date().toISOString().slice(0, 10), liquid: "" as unknown as number });
  });
  const deleteMutation = useDeleteSnapshot();

  const ready = txQuery.isSuccess && stylesQuery.isSuccess;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly snapshots</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <MonthlyRiskChart snapshots={snapQuery.data ?? []} />
        <SnapshotForm
          form={form}
          disabled={!ready}
          onSubmit={(values) => snapMutation.mutate(values)}
        />
        <SnapshotsTable
          rows={snapQuery.data ?? []}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      </CardContent>
    </Card>
  );
}
