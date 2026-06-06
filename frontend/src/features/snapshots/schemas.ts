import { z } from "zod";

export const snapFormSchema = z.object({
  snapshotDate: z.string().min(1),
  liquid: z.coerce.number().finite()
});

export type SnapFormValues = z.infer<typeof snapFormSchema>;
