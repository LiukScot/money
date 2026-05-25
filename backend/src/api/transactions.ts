import { Hono } from "hono";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDrizzle } from "../db.ts";
import { transactions } from "../db/schema.ts";
import { txSchema } from "../schemas.ts";
import { inferType, makeId, normalizeTx } from "../helpers.ts";
import type { AppEnv } from "./types.ts";
import { jsonData, jsonError, validateJson } from "./responses.ts";
import { readPageBounds } from "./pagination.ts";

export const transactionRoutes = new Hono<AppEnv>();

transactionRoutes.get("/", (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const { limit, offset } = readPageBounds(c);
  const rows = getDrizzle(db)
    .select()
    .from(transactions)
    .where(eq(transactions.user_id, user.id))
    .orderBy(desc(transactions.tx_date), desc(transactions.id))
    .limit(limit)
    .offset(offset)
    .all() as Parameters<typeof normalizeTx>[0][];
  return jsonData(c, rows.map(normalizeTx));
});

transactionRoutes.post("/", validateJson(txSchema), (c) => {
  const body = c.req.valid("json");
  const db = c.get("db");
  const user = c.get("user");
  const id = makeId("tx");
  const derivedType = body.derivedType || inferType(body.tipo, body.buyValue, body.pnl);
  const currentValue = Number.isFinite(body.currentValue)
    ? Number(body.currentValue)
    : body.buyValue + body.pnl;
  getDrizzle(db)
    .insert(transactions)
    .values({
      id,
      user_id: user.id,
      tx_date: body.txDate,
      asset: body.asset,
      tipo: body.tipo,
      derived_type: derivedType,
      buy_value: body.buyValue,
      pnl: body.pnl,
      current_value: currentValue,
      note: body.note ?? ""
    })
    .run();
  return jsonData(c, { id }, 201);
});

transactionRoutes.put("/:id", validateJson(txSchema), (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const db = c.get("db");
  const user = c.get("user");
  const derivedType = body.derivedType || inferType(body.tipo, body.buyValue, body.pnl);
  const currentValue = Number.isFinite(body.currentValue)
    ? Number(body.currentValue)
    : body.buyValue + body.pnl;
  const result = getDrizzle(db)
    .update(transactions)
    .set({
      tx_date: body.txDate,
      asset: body.asset,
      tipo: body.tipo,
      derived_type: derivedType,
      buy_value: body.buyValue,
      pnl: body.pnl,
      current_value: currentValue,
      note: body.note ?? "",
      updated_at: sql`CURRENT_TIMESTAMP`
    })
    .where(and(eq(transactions.id, id), eq(transactions.user_id, user.id)))
    .returning({ id: transactions.id })
    .all();
  if (result.length === 0) return jsonError(c, "NOT_FOUND", "Transaction not found", 404);
  return jsonData(c, { ok: true });
});

transactionRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const user = c.get("user");
  const result = getDrizzle(db)
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.user_id, user.id)))
    .returning({ id: transactions.id })
    .all();
  if (result.length === 0) return jsonError(c, "NOT_FOUND", "Transaction not found", 404);
  return jsonData(c, { ok: true });
});
