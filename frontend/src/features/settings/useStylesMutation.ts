import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, okSchema } from "@/lib";
import { stylesResponse, type StylesMap } from "@/types";


export function useStylesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["styles"],
    enabled,
    queryFn: async () =>
      apiFetch("/api/v1/assets/styles", { method: "GET" }, (raw) => stylesResponse.parse(raw).data)
  });
}

export function useStylesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (styles: StylesMap) =>
      apiFetch(
        "/api/v1/assets/styles",
        { method: "PUT", body: JSON.stringify({ styles }) },
        (raw) => okSchema.parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["styles"] });
    }
  });
}
