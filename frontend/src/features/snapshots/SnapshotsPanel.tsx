import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { apiFetch, todayIso } from "@/lib";
import { stylesResponse } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyRiskChart } from "./MonthlyRiskChart";
import { SnapshotForm } from "./SnapshotForm";
import { SnapshotsTable } from "./SnapshotsTable";
import { useSnapshotsQuery } from "./useSnapshotsQuery";
import { useSnapMutation } from "./useSnapMutation";
import { useDeleteSnapshot } from "./useDeleteSnapshot";
import { type SnapFormDefaults } from "./schemas";
import { useTransactionsQuery } from "../transactions/useTransactionsQuery";

function getSnapDefaults(): SnapFormDefaults {
  return { snapshotDate: todayIso(), liquid: "" };
}

export function SnapshotsPanel() {
  const snapQuery = useSnapshotsQuery(true);

  // Keep tx + styles caches warm so useSnapMutation can derive risk totals
  // and so the Add button only enables once both are ready.
  const txQuery = useTransactionsQuery(true);
  const stylesQuery = useQuery({
    queryKey: ["styles"],
    queryFn: async ({ signal }) =>
      apiFetch("/api/v1/assets/styles", { method: "GET", signal }, (raw) => stylesResponse.parse(raw).data)
  });

  const form = useForm<SnapFormDefaults>({
    defaultValues: getSnapDefaults()
  });

  const snapMutation = useSnapMutation(() => {
    form.reset(getSnapDefaults());
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
