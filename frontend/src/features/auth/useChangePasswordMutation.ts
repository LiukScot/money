import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import type { ChangePasswordValues } from "./schemas";

const okSchema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));

export function useChangePasswordMutation(onAfterSuccess?: () => void) {
  return useMutation({
    mutationFn: async (values: ChangePasswordValues) =>
      apiFetch(
        "/api/v1/auth/change-password",
        {
          method: "POST",
          body: JSON.stringify({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword
          })
        },
        (raw) => okSchema.parse(raw).data
      ),
    onSuccess: () => {
      onAfterSuccess?.();
      alert("Password updated");
    }
  });
}
