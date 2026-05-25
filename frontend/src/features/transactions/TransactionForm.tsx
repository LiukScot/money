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
import { AssetCombobox } from "./AssetCombobox";
import {
  TIPO_OPTIONS,
  tipoShowsBuyValue,
  tipoShowsPnl,
  type TxFormValues
} from "./schemas";

type Props = {
  form: UseFormReturn<TxFormValues>;
  assetOptions: string[];
  editingId: string | null;
  onSubmit: (values: TxFormValues) => void;
  onCancel: () => void;
};

export function TransactionForm({ form, assetOptions, editingId, onSubmit, onCancel }: Props) {
  const watchedTipo = form.watch("tipo");
  const showBuyValue = tipoShowsBuyValue(watchedTipo);
  const showPnl = tipoShowsPnl(watchedTipo);

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        <Field id="tx-date" label="Date">
          <Input id="tx-date" type="date" {...form.register("txDate")} />
        </Field>
        <Controller
          control={form.control}
          name="asset"
          render={({ field }) => (
            <AssetCombobox
              id="tx-asset"
              label="Asset"
              value={field.value}
              onChange={field.onChange}
              options={assetOptions}
            />
          )}
        />
        <Field id="tx-tipo" label="Tipo">
          <Controller
            control={form.control}
            name="tipo"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="tx-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        {showBuyValue && (
          <Field id="tx-buyValue" label="Buy value">
            <Input id="tx-buyValue" type="number" step="0.01" placeholder="0" {...form.register("buyValue")} />
          </Field>
        )}
        {showPnl && (
          <Field id="tx-pnl" label="PnL">
            <Input id="tx-pnl" type="number" step="0.01" placeholder="0" {...form.register("pnl")} />
          </Field>
        )}
        <Field id="tx-note" label="Note">
          <Textarea id="tx-note" {...form.register("note")} />
        </Field>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button type="submit">{editingId ? "Update" : "Add"}</Button>
        {editingId && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
