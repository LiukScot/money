import { z } from "zod";

export const TIPO_OPTIONS = [
  "nuovo vincolo",
  "cedola",
  "interessi",
  "cashback",
  "Variazione Valore"
] as const;

const TIPO_PNL_ONLY = new Set<string>(["cedola", "interessi", "cashback", "Variazione Valore"]);
const TIPO_BUY_ONLY = new Set<string>(["nuovo vincolo"]);

export function tipoShowsBuyValue(tipo: string): boolean {
  if (TIPO_PNL_ONLY.has(tipo)) return false;
  return true;
}

export function tipoShowsPnl(tipo: string): boolean {
  if (TIPO_BUY_ONLY.has(tipo)) return false;
  return true;
}

export const txFormSchema = z.object({
  txDate: z.string().min(1),
  asset: z.string().min(1),
  tipo: z.string().min(1),
  buyValue: z.coerce.number(),
  pnl: z.coerce.number(),
  note: z.string().default("")
});

export type TxFormValues = z.infer<typeof txFormSchema>;

export const txFormDefaults: TxFormValues = {
  txDate: new Date().toISOString().slice(0, 10),
  asset: "",
  tipo: "nuovo vincolo",
  // empty string renders placeholder in number input; z.coerce.number maps "" → 0 at submit
  buyValue: "" as unknown as number,
  pnl: "" as unknown as number,
  note: ""
};
