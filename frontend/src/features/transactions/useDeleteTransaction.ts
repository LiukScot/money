import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, okSchema } from "@/lib";


export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch(
        `/api/v1/transactions/${id}`,
        { method: "DELETE" },
        (raw) => okSchema.parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });
}
