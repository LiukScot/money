import { z } from "zod";

export const mmFormSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(["income", "expense"]),
  amount: z.coerce.number().nonnegative(),
  note: z.string().default("")
});

export type MmFormValues = z.infer<typeof mmFormSchema>;

export const mmFormDefaults: MmFormValues = {
  name: "",
  direction: "income",
  // empty string renders placeholder in number input; z.coerce.number maps "" → 0 at submit
  amount: "" as unknown as number,
  note: ""
};
