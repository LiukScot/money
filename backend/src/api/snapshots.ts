import { Hono } from "hono";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDrizzle } from "../db.ts";
import { monthly_snapshots } from "../db/schema.ts";
import { snapshotSchema } from "../schemas.ts";
import { makeId, normalizeSnap } from "../helpers.ts";
import type { AppEnv } from "./types.ts";
import { jsonData, jsonError, validateJson } from "./responses.ts";
import { readPageBounds } from "./pagination.ts";

export const snapshotRoutes = new Hono<AppEnv>();

snapshotRoutes.get("/", (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const { limit, offset } = readPageBounds(c);
  const rows = getDrizzle(db)
    .select()
    .from(monthly_snapshots)
    .where(eq(monthly_snapshots.user_id, user.id))
    .orderBy(desc(monthly_snapshots.snapshot_date), desc(monthly_snapshots.id))
    .limit(limit)
    .offset(offset)
    .all() as Parameters<typeof normalizeSnap>[0][];
  return jsonData(c, rows.map(normalizeSnap));
});

snapshotRoutes.post("/", validateJson(snapshotSchema), (c) => {
  const body = c.req.valid("json");
  const db = c.get("db");
  const user = c.get("user");
  const id = makeId("snap");
  getDrizzle(db)
    .insert(monthly_snapshots)
    .values({
      id,
      user_id: user.id,
      snapshot_date: body.snapshotDate,
      low_risk: body.lowRisk,
      medium_risk: body.mediumRisk,
      high_risk: body.highRisk,
      liquid: body.liquid
    })
    .run();
  return jsonData(c, { id }, 201);
});

snapshotRoutes.put("/:id", validateJson(snapshotSchema), (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const db = c.get("db");
  const user = c.get("user");
  const result = getDrizzle(db)
    .update(monthly_snapshots)
    .set({
      snapshot_date: body.snapshotDate,
      low_risk: body.lowRisk,
      medium_risk: body.mediumRisk,
      high_risk: body.highRisk,
      liquid: body.liquid,
      updated_at: sql`CURRENT_TIMESTAMP`
    })
    .where(and(eq(monthly_snapshots.id, id), eq(monthly_snapshots.user_id, user.id)))
    .returning({ id: monthly_snapshots.id })
    .all();
  if (result.length === 0) return jsonError(c, "NOT_FOUND", "Monthly snapshot not found", 404);
  return jsonData(c, { ok: true });
});

snapshotRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const user = c.get("user");
  const result = getDrizzle(db)
    .delete(monthly_snapshots)
    .where(and(eq(monthly_snapshots.id, id), eq(monthly_snapshots.user_id, user.id)))
    .returning({ id: monthly_snapshots.id })
    .all();
  if (result.length === 0) return jsonError(c, "NOT_FOUND", "Monthly snapshot not found", 404);
  return jsonData(c, { ok: true });
});
