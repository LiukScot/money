import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";

const okSchema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));

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
