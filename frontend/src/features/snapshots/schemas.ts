import { z } from "zod";

export const snapFormSchema = z.object({
  snapshotDate: z.string().min(1),
  liquid: z.coerce.number().finite()
});

export type SnapFormValues = z.infer<typeof snapFormSchema>;

/** Default values for useForm. liquid accepts "" so the input renders
 *  a placeholder; z.coerce.number maps "" → 0 when the form is submitted. */
export type SnapFormDefaults = Omit<SnapFormValues, "liquid"> & {
  liquid: number | "";
};
