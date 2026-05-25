import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  name: text("name"),
  created_at: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  disabled_at: text("disabled_at"),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tx_date: text("tx_date").notNull(),
    asset: text("asset").notNull(),
    tipo: text("tipo").notNull(),
    derived_type: text("derived_type").notNull(),
    buy_value: real("buy_value").notNull().default(0),
    pnl: real("pnl").notNull().default(0),
    current_value: real("current_value").notNull().default(0),
    note: text("note"),
    created_at: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("idx_tx_user_date").on(t.user_id, sql`${t.tx_date} DESC`)]
);

export const monthly_movements = sqliteTable(
  "monthly_movements",
  {
    id: text("id").primaryKey(),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    direction: text("direction").notNull(),
    amount: real("amount").notNull().default(0),
    note: text("note"),
    created_at: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_mm_user").on(t.user_id, t.direction),
    index("idx_mm_user_name").on(t.user_id, t.name, t.id),
  ]
);

export const monthly_snapshots = sqliteTable(
  "monthly_snapshots",
  {
    id: text("id").primaryKey(),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    snapshot_date: text("snapshot_date").notNull(),
    low_risk: real("low_risk").notNull().default(0),
    medium_risk: real("medium_risk").notNull().default(0),
    high_risk: real("high_risk").notNull().default(0),
    liquid: real("liquid").notNull().default(0),
    created_at: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_snap_user_date").on(t.user_id, sql`${t.snapshot_date} DESC`),
  ]
);

export const asset_styles = sqliteTable(
  "asset_styles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    asset: text("asset").notNull(),
    color_hex: text("color_hex"),
    risk_level: text("risk_level"),
    updated_at: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("asset_styles_user_asset_unique").on(t.user_id, t.asset),
    index("idx_asset_style_user").on(t.user_id, t.asset),
  ]
);

export const user_preferences = sqliteTable("user_preferences", {
  user_id: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  show_zero_assets: integer("show_zero_assets").notNull().default(0),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const user_sessions = sqliteTable(
  "user_sessions",
  {
    sid: text("sid").primaryKey(),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    expires_at: integer("expires_at").notNull(),
    created_at: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_user_sessions_user").on(t.user_id),
    index("idx_user_sessions_expires_at").on(t.expires_at),
  ]
);
