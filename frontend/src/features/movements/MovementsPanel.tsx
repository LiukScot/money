import { useState } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MovementForm } from "./MovementForm";
import { MovementsTable } from "./MovementsTable";
import { useMovementsQuery } from "./useMovementsQuery";
import { useMmMutation } from "./useMmMutation";
import { useDeleteMovement } from "./useDeleteMovement";
import { mmFormDefaults, type MmFormValues } from "./schemas";

export function MovementsPanel() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const mmQuery = useMovementsQuery(true);

  const form = useForm<MmFormValues>({ defaultValues: mmFormDefaults });

  const mmMutation = useMmMutation(editingId, () => {
    setEditingId(null);
    form.reset(mmFormDefaults);
  });
  const deleteMutation = useDeleteMovement();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly movements</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <MovementForm
          form={form}
          editingId={editingId}
          onSubmit={(values) => mmMutation.mutate(values)}
          onCancel={() => {
            setEditingId(null);
            form.reset(mmFormDefaults);
          }}
        />
        <MovementsTable
          rows={mmQuery.data ?? []}
          onEdit={(row) => {
            setEditingId(row.id);
            form.reset({ name: row.name, direction: row.direction, amount: row.amount, note: row.note });
          }}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      </CardContent>
    </Card>
  );
}
