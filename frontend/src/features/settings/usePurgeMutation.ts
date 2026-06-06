import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, okSchema } from "@/lib";


export function usePurgeMutation(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/data/purge", { method: "POST" }, (raw) => okSchema.parse(raw).data),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onSuccess?.();
    }
  });
}
