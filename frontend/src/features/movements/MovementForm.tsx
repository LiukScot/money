import { Controller, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Field } from "@/shared/ui/Field";
import type { MmFormDefaults } from "./schemas";

type Props = {
  form: UseFormReturn<MmFormDefaults>;
  editingId: string | null;
  isSubmitting: boolean;
  onSubmit: (values: MmFormDefaults) => void;
  onCancel: () => void;
};

export function MovementForm({ form, editingId, isSubmitting, onSubmit, onCancel }: Props) {
  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        <Field id="mm-name" label="Name">
          <Input id="mm-name" type="text" {...form.register("name")} />
        </Field>
        <Field id="mm-direction" label="Direction">
          <Controller
            control={form.control}
            name="direction"
            render={({ field }) => (
              <Select value={field.value} onValueChange={(v) => field.onChange(v as "income" | "expense")}>
                <SelectTrigger id="mm-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">income</SelectItem>
                  <SelectItem value="expense">expense</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field id="mm-amount" label="Amount">
          <Input id="mm-amount" type="number" step="0.01" placeholder="0" {...form.register("amount")} />
        </Field>
        <Field id="mm-note" label="Note">
          <Textarea id="mm-note" {...form.register("note")} />
        </Field>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button type="submit" disabled={isSubmitting}>{editingId ? "Update" : "Add"}</Button>
        {editingId && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
