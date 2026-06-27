import { Hono } from "hono";

import { wipeUserData } from "./backup-helpers.ts";
import type { AppEnv } from "./types.ts";
import { jsonData, jsonError } from "./responses.ts";

export const purgeRoutes = new Hono<AppEnv>();

purgeRoutes.post("/purge", (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const tx = db.transaction(() => {
    wipeUserData(db, user.id, true, true);
  });
  try {
    tx();
  } catch (e) {
    console.error("[purge] failed:", e);
    return jsonError(c, "PURGE_FAILED", "Purge failed. Check server logs for details.", 500);
  }
  return jsonData(c, { ok: true });
});
