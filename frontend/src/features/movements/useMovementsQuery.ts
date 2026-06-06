import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import { mmSchema } from "@/types";

export function useMovementsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["movements"],
    enabled,
    queryFn: async ({ signal }) =>
      apiFetch(
        "/api/v1/monthly-movements",
        { method: "GET", signal },
        (raw) => apiEnvelopeSchema(z.array(mmSchema)).parse(raw).data
      )
  });
}
