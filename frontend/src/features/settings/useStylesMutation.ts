import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import type { StylesMap } from "@/types";

const stylesShape = apiEnvelopeSchema(
  z.record(z.string(), z.object({ colorHex: z.string().nullable(), riskLevel: z.string().nullable() }))
);

const okSchema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));

export function useStylesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["styles"],
    enabled,
    queryFn: async () =>
      apiFetch("/api/v1/assets/styles", { method: "GET" }, (raw) => stylesShape.parse(raw).data as StylesMap)
  });
}

export function useStylesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (styles: StylesMap) =>
      apiFetch(
        "/api/v1/assets/styles",
        { method: "PUT", body: JSON.stringify({ styles }) },
        (raw) => okSchema.parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["styles"] });
    }
  });
}
