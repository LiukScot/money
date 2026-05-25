import { type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/shared/ui/Field";
import type { SnapFormValues } from "./schemas";

type Props = {
  form: UseFormReturn<SnapFormValues>;
  disabled: boolean;
  onSubmit: (values: SnapFormValues) => void;
};

export function SnapshotForm({ form, disabled, onSubmit }: Props) {
  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        <Field id="snap-date" label="Date">
          <Input id="snap-date" type="date" {...form.register("snapshotDate")} />
        </Field>
        <Field id="snap-liquid" label="Liquid">
          <Input id="snap-liquid" type="number" step="0.01" placeholder="0" {...form.register("liquid")} />
        </Field>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button type="submit" disabled={disabled}>Add</Button>
      </div>
    </form>
  );
}
