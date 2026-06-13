import { Hono } from "hono";

import { eq } from "drizzle-orm";
import { getDrizzle } from "../db.ts";
import { asset_styles } from "../db/schema.ts";
import { stylesSchema } from "../schemas.ts";
import type { AppEnv } from "./types.ts";
import { jsonData, jsonError, validateJson } from "./responses.ts";

export const stylesRoutes = new Hono<AppEnv>();

stylesRoutes.get("/", (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const rows = getDrizzle(db)
    .select({
      asset: asset_styles.asset,
      color_hex: asset_styles.color_hex,
      risk_level: asset_styles.risk_level
    })
    .from(asset_styles)
    .where(eq(asset_styles.user_id, user.id))
    .all();
  const styles: Record<string, { colorHex: string | null; riskLevel: string | null }> = {};
  rows.forEach((row) => {
    styles[row.asset] = { colorHex: row.color_hex ?? null, riskLevel: row.risk_level ?? null };
  });
  return jsonData(c, styles);
});

stylesRoutes.put("/", validateJson(stylesSchema), (c) => {
  const body = c.req.valid("json");
  const db = c.get("db");
  const user = c.get("user");
  const dbo = getDrizzle(db);
  const tx = db.transaction(() => {
    dbo.delete(asset_styles).where(eq(asset_styles.user_id, user.id)).run();
    const rows = Object.entries(body.styles)
      .filter(([asset]) => asset.trim())
      .map(([asset, style]) => ({
        user_id: user.id,
        asset: asset.trim(),
        color_hex: style.colorHex ?? null,
        risk_level: style.riskLevel ?? null
      }));
    if (rows.length > 0) {
      dbo.insert(asset_styles).values(rows).run();
    }
  });
  try {
    tx();
  } catch (e) {
    console.error("[styles] put failed:", e);
    return jsonError(c, "STYLES_SAVE_FAILED", "Failed to save styles. Check server logs.", 500);
  }
  return jsonData(c, { ok: true });
});
