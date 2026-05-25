import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import type { StylesMap, Transaction } from "@/types";
import { computePerAsset } from "@/lib/dashboard";
import { snapFormSchema, type SnapFormValues } from "./schemas";

const okSchema = apiEnvelopeSchema(z.object({ id: z.string() }));

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Create a monthly snapshot.
 *
 * Derives low/medium/high risk totals from cached transactions + styles.
 * Caller (Panel) is responsible for keeping those queries warm and
 * disabling the submit button until they have loaded.
 */
export function useSnapMutation(onAfterSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: SnapFormValues) => {
      const form = snapFormSchema.parse(values);
      const transactions = queryClient.getQueryData<Transaction[]>(["transactions"]);
      const stylesMap = queryClient.getQueryData<StylesMap>(["styles"]);
      if (!transactions || !stylesMap) {
        throw new Error(
          "Attendi il caricamento di transazioni e stili asset prima di creare uno snapshot."
        );
      }
      const stats = computePerAsset(transactions, stylesMap);
      const totals = { low: 0, medium: 0, high: 0 };
      for (const s of stats) {
        if (s.riskLevel === "low") totals.low += s.current;
        else if (s.riskLevel === "medium") totals.medium += s.current;
        else if (s.riskLevel === "high") totals.high += s.current;
      }
      const payload = {
        snapshotDate: form.snapshotDate,
        lowRisk: round2(totals.low),
        mediumRisk: round2(totals.medium),
        highRisk: round2(totals.high),
        liquid: form.liquid
      };
      return apiFetch(
        "/api/v1/monthly-snapshots",
        { method: "POST", body: JSON.stringify(payload) },
        (raw) => okSchema.parse(raw).data
      );
    },
    onSuccess: async () => {
      onAfterSuccess();
      await queryClient.invalidateQueries({ queryKey: ["snapshots"] });
    }
  });
}
