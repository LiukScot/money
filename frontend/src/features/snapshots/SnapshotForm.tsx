import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/shared/ui/Field";
import { snapFormSchema, type SnapFormValues } from "./schemas";

type Props = {
  disabled: boolean;
  onSubmit: (values: SnapFormValues) => void;
  resetSignal?: number;
};

export function SnapshotForm({ disabled, onSubmit }: Props) {
  const form = useForm<SnapFormValues>({
    defaultValues: {
      snapshotDate: new Date().toISOString().slice(0, 10),
      // empty string renders placeholder in number input; z.coerce.number maps "" → 0 at submit
      liquid: "" as unknown as number
    }
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit((values) => {
        onSubmit(snapFormSchema.parse(values));
        form.reset({ snapshotDate: new Date().toISOString().slice(0, 10), liquid: "" as unknown as number });
      })}
    >
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
