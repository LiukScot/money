import { z } from "zod";

export const TIPO_OPTIONS = [
  "nuovo vincolo",
  "cedola",
  "interessi",
  "cashback",
  "Variazione Valore"
] as const;

const TIPO_BUY_ONLY = new Set<string>(["nuovo vincolo"]);

export function tipoShowsBuyValue(tipo: string): boolean {
  return TIPO_BUY_ONLY.has(tipo);
}

export function tipoShowsPnl(tipo: string): boolean {
  return !tipoShowsBuyValue(tipo);
}

export const txFormSchema = z.object({
  txDate: z.string().min(1),
  asset: z.string().min(1),
  tipo: z.string().min(1),
  buyValue: z.coerce.number().finite(),
  pnl: z.coerce.number().finite(),
  note: z.string().default("")
});

export type TxFormValues = z.infer<typeof txFormSchema>;

/** Default values for useForm. Number fields accept "" so the input renders
 *  a placeholder; z.coerce.number maps "" → 0 when the form is submitted. */
export type TxFormDefaults = Omit<TxFormValues, "buyValue" | "pnl"> & {
  buyValue: number | "";
  pnl: number | "";
};

export const txFormDefaults: TxFormDefaults = {
  txDate: new Date().toISOString().slice(0, 10),
  asset: "",
  tipo: "nuovo vincolo",
  buyValue: "",
  pnl: "",
  note: ""
};
