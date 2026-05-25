import { Hono } from "hono";

import { eq, sql } from "drizzle-orm";
import { getDrizzle } from "../db.ts";
import { user_preferences } from "../db/schema.ts";
import { prefsSchema } from "../schemas.ts";
import type { AppEnv } from "./types.ts";
import { jsonData, validateJson } from "./responses.ts";

export const prefsRoutes = new Hono<AppEnv>();

prefsRoutes.get("/", (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const row = getDrizzle(db)
    .select({
      show_zero_assets: user_preferences.show_zero_assets,
      updated_at: user_preferences.updated_at
    })
    .from(user_preferences)
    .where(eq(user_preferences.user_id, user.id))
    .limit(1)
    .get();
  return jsonData(c, {
    showZeroAssets: Boolean(row?.show_zero_assets ?? 0),
    updatedAt: row?.updated_at ?? null
  });
});

prefsRoutes.put("/", validateJson(prefsSchema), (c) => {
  const body = c.req.valid("json");
  const db = c.get("db");
  const user = c.get("user");
  getDrizzle(db)
    .insert(user_preferences)
    .values({
      user_id: user.id,
      show_zero_assets: body.showZeroAssets ? 1 : 0
    })
    .onConflictDoUpdate({
      target: user_preferences.user_id,
      set: {
        show_zero_assets: body.showZeroAssets ? 1 : 0,
        updated_at: sql`CURRENT_TIMESTAMP`
      }
    })
    .run();
  return jsonData(c, { ok: true });
});
