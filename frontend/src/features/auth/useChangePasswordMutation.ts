import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, okSchema } from "@/lib";
import type { ChangePasswordValues } from "./schemas";


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
      toast.success("Password updated");
    }
  });
}
