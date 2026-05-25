import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((v) => !isNaN(Date.parse(v)), "Invalid calendar date");

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(72)
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: z.string().min(8).max(72)
  })
  .strict();

export const txSchema = z.object({
  txDate: isoDate,
  asset: z.string().min(1).max(120),
  tipo: z.string().min(1).max(60),
  derivedType: z.string().max(40).optional(),
  buyValue: z.coerce.number().default(0),
  pnl: z.coerce.number().default(0),
  currentValue: z.coerce.number().optional(),
  note: z.string().max(2000).default("")
});

export const movementSchema = z.object({
  name: z.string().min(1).max(120),
  direction: z.enum(["income", "expense"]),
  amount: z.coerce.number().nonnegative(),
  note: z.string().max(2000).default("")
});

export const snapshotSchema = z.object({
  snapshotDate: isoDate,
  lowRisk: z.coerce.number().default(0),
  mediumRisk: z.coerce.number().default(0),
  highRisk: z.coerce.number().default(0),
  liquid: z.coerce.number().default(0)
});

export const stylesSchema = z.object({
  styles: z
    .record(
      z.string(),
      z.object({
        colorHex: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .nullable(),
        riskLevel: z.enum(["low", "medium", "high"]).optional().nullable()
      })
    )
    .refine((v) => Object.keys(v).length <= 500, "Too many style entries (max 500)")
});

export const prefsSchema = z.object({ showZeroAssets: z.boolean() });

export const backupImportSchema = z.object({
  transactions: z.array(z.record(z.string(), z.any())).optional(),
  monthlyMovements: z.array(z.record(z.string(), z.any())).optional(),
  monthlySnapshots: z.array(z.record(z.string(), z.any())).optional(),
  assetColors: z.record(z.string(), z.string()).optional(),
  assetRisks: z.record(z.string(), z.string()).optional(),
  preferences: z.record(z.string(), z.any()).optional()
});

export type ApiEnv = {
  HOST: string;
  PORT: number;
  DB_PATH: string;
  SESSION_TTL_SECONDS: number;
  SESSION_COOKIE_NAME: string;
  ALLOWED_ORIGINS: string;
  PUBLIC_DIR: string;
  COOKIE_SECURE: string;
  /** Max failed login attempts per IP per window. Disable rate limit with 0. */
  LOGIN_RATE_LIMIT_MAX: number;
  /** Sliding window length in seconds for the login rate limit. */
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: number;
};
