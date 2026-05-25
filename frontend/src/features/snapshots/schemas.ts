import { z } from "zod";

export const snapFormSchema = z.object({
  snapshotDate: z.string().min(1),
  liquid: z.coerce.number()
});

export type SnapFormValues = z.infer<typeof snapFormSchema>;
