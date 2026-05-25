import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";

const prefsSchema = apiEnvelopeSchema(
  z.object({
    showZeroAssets: z.boolean(),
    updatedAt: z.string().nullable().optional()
  })
);

const okSchema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));

export function usePreferencesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["prefs"],
    enabled,
    queryFn: async () =>
      apiFetch("/api/v1/preferences", { method: "GET" }, (raw) => prefsSchema.parse(raw).data)
  });
}

export function usePreferencesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (showZeroAssets: boolean) =>
      apiFetch(
        "/api/v1/preferences",
        { method: "PUT", body: JSON.stringify({ showZeroAssets }) },
        (raw) => okSchema.parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prefs"] });
    }
  });
}
