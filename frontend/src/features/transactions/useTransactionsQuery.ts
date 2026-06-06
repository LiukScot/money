import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import { txSchema } from "@/types";

export function useTransactionsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["transactions"],
    enabled,
    queryFn: async ({ signal }) =>
      apiFetch(
        "/api/v1/transactions",
        { method: "GET", signal },
        (raw) => apiEnvelopeSchema(z.array(txSchema)).parse(raw).data
      )
  });
}
