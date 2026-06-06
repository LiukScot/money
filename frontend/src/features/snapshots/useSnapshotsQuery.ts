import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";
import { snapSchema } from "@/types";

export function useSnapshotsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["snapshots"],
    enabled,
    queryFn: async ({ signal }) =>
      apiFetch(
        "/api/v1/monthly-snapshots",
        { method: "GET", signal },
        (raw) => apiEnvelopeSchema(z.array(snapSchema)).parse(raw).data
      )
  });
}
