import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import { txSchema, type StylesMap } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyRiskChart } from "./MonthlyRiskChart";
import { SnapshotForm } from "./SnapshotForm";
import { SnapshotsTable } from "./SnapshotsTable";
import { useSnapshotsQuery } from "./useSnapshotsQuery";
import { useSnapMutation } from "./useSnapMutation";
import { useDeleteSnapshot } from "./useDeleteSnapshot";

const stylesShape = apiEnvelopeSchema(
  z.record(z.string(), z.object({ colorHex: z.string().nullable(), riskLevel: z.string().nullable() }))
);

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
      apiFetch("/api/v1/assets/styles", { method: "GET" }, (raw) => stylesShape.parse(raw).data as StylesMap)
  });

  const snapMutation = useSnapMutation(() => {});
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
