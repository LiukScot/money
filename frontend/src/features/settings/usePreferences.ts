import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import { prefsResponse } from "@/types";

const okSchema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));

export function usePreferencesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["prefs"],
    enabled,
    queryFn: async ({ signal }) =>
      apiFetch("/api/v1/preferences", { method: "GET", signal }, (raw) => prefsResponse.parse(raw).data)
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
