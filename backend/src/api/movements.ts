import { Hono } from "hono";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDrizzle } from "../db.ts";
import { monthly_movements } from "../db/schema.ts";
import { movementSchema } from "../schemas.ts";
import { makeId, normalizeMm } from "../helpers.ts";
import type { AppEnv } from "./types.ts";
import { jsonData, jsonError, validateJson } from "./responses.ts";
import { readPageBounds } from "./pagination.ts";

export const movementRoutes = new Hono<AppEnv>();

movementRoutes.get("/", (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const { limit, offset } = readPageBounds(c);
  const rows = getDrizzle(db)
    .select()
    .from(monthly_movements)
    .where(eq(monthly_movements.user_id, user.id))
    .orderBy(monthly_movements.name, desc(monthly_movements.id))
    .limit(limit)
    .offset(offset)
    .all() as Parameters<typeof normalizeMm>[0][];
  return jsonData(c, rows.map(normalizeMm));
});

movementRoutes.post("/", validateJson(movementSchema), (c) => {
  const body = c.req.valid("json");
  const db = c.get("db");
  const user = c.get("user");
  const id = makeId("mm");
  getDrizzle(db)
    .insert(monthly_movements)
    .values({
      id,
      user_id: user.id,
      name: body.name,
      direction: body.direction,
      amount: body.amount,
      note: body.note ?? ""
    })
    .run();
  return jsonData(c, { id }, 201);
});

movementRoutes.put("/:id", validateJson(movementSchema), (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const db = c.get("db");
  const user = c.get("user");
  const result = getDrizzle(db)
    .update(monthly_movements)
    .set({
      name: body.name,
      direction: body.direction,
      amount: body.amount,
      note: body.note ?? "",
      updated_at: sql`CURRENT_TIMESTAMP`
    })
    .where(and(eq(monthly_movements.id, id), eq(monthly_movements.user_id, user.id)))
    .returning({ id: monthly_movements.id })
    .all();
  if (result.length === 0) return jsonError(c, "NOT_FOUND", "Monthly movement not found", 404);
  return jsonData(c, { ok: true });
});

movementRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const user = c.get("user");
  const result = getDrizzle(db)
    .delete(monthly_movements)
    .where(and(eq(monthly_movements.id, id), eq(monthly_movements.user_id, user.id)))
    .returning({ id: monthly_movements.id })
    .all();
  if (result.length === 0) return jsonError(c, "NOT_FOUND", "Monthly movement not found", 404);
  return jsonData(c, { ok: true });
});
