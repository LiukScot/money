import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, okSchema } from "@/lib";


export function useDeleteSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch(
        `/api/v1/monthly-snapshots/${id}`,
        { method: "DELETE" },
        (raw) => okSchema.parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["snapshots"] });
    }
  });
}
