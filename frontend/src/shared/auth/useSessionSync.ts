import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib";
import { sessionSchema } from "./sessionSchema";
import { useAuthStore } from "./authStore";

/**
 * Sync server session → client zustand store.
 *
 * Returns the underlying query so the consumer can inspect loading/error if needed.
 *
 * The effect re-runs whenever `user` changes (and on session data updates).
 * The two conditions guard against an infinite loop: setUser(session.user)
 * only fires when there's no current user, and setUser(null) only when there
 * is one. Keep both guards if you touch this — otherwise the next render's
 * effect will overwrite the freshly-set value.
 */
export function useSessionSync() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: async () =>
      apiFetch("/api/v1/auth/session", { method: "GET" }, (raw) => sessionSchema.parse(raw).data)
  });

  useEffect(() => {
    if (sessionQuery.data?.authenticated && sessionQuery.data.user && !user) {
      setUser(sessionQuery.data.user);
    }
    if (sessionQuery.data && !sessionQuery.data.authenticated && user) {
      setUser(null);
    }
  }, [sessionQuery.data, user, setUser]);

  return sessionQuery;
}
