import { z } from "zod";
import { apiEnvelopeSchema } from "./lib";

export const txSchema = z.object({
  id: z.string(),
  txDate: z.string(),
  asset: z.string(),
  tipo: z.string(),
  derivedType: z.string(),
  buyValue: z.number(),
  pnl: z.number(),
  currentValue: z.number(),
  note: z.string()
});

export const mmSchema = z.object({
  id: z.string(),
  name: z.string(),
  direction: z.enum(["income", "expense"]),
  amount: z.number(),
  note: z.string()
});

export const snapSchema = z.object({
  id: z.string(),
  snapshotDate: z.string(),
  lowRisk: z.number(),
  mediumRisk: z.number(),
  highRisk: z.number(),
  liquid: z.number()
});

export const assetStyleSchema = z.object({
  colorHex: z.string().nullable(),
  riskLevel: z.string().nullable()
});

export const stylesMapSchema = z.record(z.string(), assetStyleSchema);

export const prefsSchema = z.object({
  showZeroAssets: z.boolean(),
  updatedAt: z.string().nullable().optional()
});

export const stylesResponse = apiEnvelopeSchema(stylesMapSchema);
export const prefsResponse = apiEnvelopeSchema(prefsSchema);
export const txListResponse = apiEnvelopeSchema(z.array(txSchema));
export const mmListResponse = apiEnvelopeSchema(z.array(mmSchema));
export const snapListResponse = apiEnvelopeSchema(z.array(snapSchema));

export type Transaction = z.infer<typeof txSchema>;
export type Movement = z.infer<typeof mmSchema>;
export type Snapshot = z.infer<typeof snapSchema>;
export type AssetStyle = z.infer<typeof assetStyleSchema>;
export type StylesMap = Record<string, AssetStyle>;
export type Preferences = z.infer<typeof prefsSchema>;

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
