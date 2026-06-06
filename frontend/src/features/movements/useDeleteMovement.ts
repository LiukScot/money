import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, okSchema } from "@/lib";


export function useDeleteMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch(
        `/api/v1/monthly-movements/${id}`,
        { method: "DELETE" },
        (raw) => okSchema.parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
    }
  });
}
