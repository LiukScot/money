import { z } from "zod";

export const mmFormSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(["income", "expense"]),
  amount: z.coerce.number().finite().nonnegative(),
  note: z.string().default("")
});

export type MmFormValues = z.infer<typeof mmFormSchema>;

/** Default values for useForm. Number field accepts "" so the input renders
 *  a placeholder; z.coerce.number maps "" → 0 when the form is submitted. */
export type MmFormDefaults = Omit<MmFormValues, "amount"> & { amount: number | "" };

export const mmFormDefaults: MmFormDefaults = {
  name: "",
  direction: "income",
  amount: "",
  note: ""
};
