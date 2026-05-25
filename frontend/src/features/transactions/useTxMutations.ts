import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import { txFormSchema, tipoShowsBuyValue, tipoShowsPnl, type TxFormValues } from "./schemas";

const createSchema = apiEnvelopeSchema(z.object({ id: z.string() }));
const okSchema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));

function buildPayload(values: TxFormValues) {
  const parsed = txFormSchema.parse(values);
  const buyValue = tipoShowsBuyValue(parsed.tipo) ? Number(parsed.buyValue) : 0;
  const pnl = tipoShowsPnl(parsed.tipo) ? Number(parsed.pnl) : 0;
  return {
    txDate: parsed.txDate,
    asset: parsed.asset,
    tipo: parsed.tipo,
    buyValue,
    pnl,
    currentValue: buyValue + pnl,
    note: parsed.note
  };
}

export function useTxMutation(editingId: string | null, onAfterSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: TxFormValues) => {
      const payload = buildPayload(values);
      if (editingId) {
        return apiFetch(
          `/api/v1/transactions/${editingId}`,
          { method: "PUT", body: JSON.stringify(payload) },
          (raw) => okSchema.parse(raw).data
        );
      }
      return apiFetch(
        "/api/v1/transactions",
        { method: "POST", body: JSON.stringify(payload) },
        (raw) => createSchema.parse(raw).data
      );
    },
    onSuccess: async () => {
      onAfterSuccess();
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });
}
