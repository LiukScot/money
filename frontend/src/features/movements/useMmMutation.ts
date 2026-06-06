import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch, okSchema } from "@/lib";
import { mmFormSchema, type MmFormValues } from "./schemas";

const createSchema = apiEnvelopeSchema(z.object({ id: z.string() }));

export function useMmMutation(editingId: string | null, onAfterSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: MmFormValues) => {
      const payload = mmFormSchema.parse(values);
      if (editingId) {
        return apiFetch(
          `/api/v1/monthly-movements/${editingId}`,
          { method: "PUT", body: JSON.stringify(payload) },
          (raw) => okSchema.parse(raw).data
        );
      }
      return apiFetch(
        "/api/v1/monthly-movements",
        { method: "POST", body: JSON.stringify(payload) },
        (raw) => createSchema.parse(raw).data
      );
    },
    onSuccess: async () => {
      onAfterSuccess();
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
    }
  });
}
