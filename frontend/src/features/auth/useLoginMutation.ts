import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import { useAuthStore } from "@/shared/auth/authStore";
import { sessionSchema } from "@/shared/auth/sessionSchema";
import type { LoginValues } from "./schemas";

const loginEnvelope = apiEnvelopeSchema(z.object({ email: z.string(), name: z.string().nullable() }));

export function useLoginMutation(onAfterSuccess?: () => void) {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: async (values: LoginValues) =>
      apiFetch(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify(values) },
        (raw) => loginEnvelope.parse(raw).data
      ),
    onSuccess: async () => {
      // staleTime: 0 overrides the global Infinity default — the session was
      // cached as unauthenticated on the login screen, so without forcing a
      // refetch fetchQuery would return that stale value after a fresh login.
      const session = await queryClient.fetchQuery({
        queryKey: ["session"],
        queryFn: async ({ signal }) =>
          apiFetch("/api/v1/auth/session", { method: "GET", signal }, (raw) => sessionSchema.parse(raw).data),
        staleTime: 0
      });
      if (session.authenticated && session.user) {
        setUser(session.user);
      }
      onAfterSuccess?.();
    }
  });
}
