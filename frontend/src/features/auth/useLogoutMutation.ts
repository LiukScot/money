import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, okSchema } from "@/lib";
import { useAuthStore } from "@/shared/auth/authStore";


export function useLogoutMutation() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/auth/logout", { method: "POST" }, (raw) => okSchema.parse(raw).data),
    onSuccess: async () => {
      setUser(null);
      await queryClient.invalidateQueries();
    }
  });
}
