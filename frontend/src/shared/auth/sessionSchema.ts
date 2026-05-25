import { z } from "zod";
import { apiEnvelopeSchema } from "@/lib";

export const sessionSchema = apiEnvelopeSchema(
  z.object({
    authenticated: z.boolean(),
    user: z
      .object({
        id: z.number(),
        email: z.string(),
        name: z.string().nullable()
      })
      .optional()
  })
);

export type SessionEnvelope = z.infer<typeof sessionSchema>;
