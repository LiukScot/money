export const SCHEMA_VERSION = 1;

export const migrationStatements: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disabled_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    tx_date TEXT NOT NULL,
    asset TEXT NOT NULL,
    tipo TEXT NOT NULL,
    derived_type TEXT NOT NULL,
    buy_value REAL NOT NULL DEFAULT 0,
    pnl REAL NOT NULL DEFAULT 0,
    current_value REAL NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS monthly_movements (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    direction TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS monthly_snapshots (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    snapshot_date TEXT NOT NULL,
    low_risk REAL NOT NULL DEFAULT 0,
    medium_risk REAL NOT NULL DEFAULT 0,
    high_risk REAL NOT NULL DEFAULT 0,
    liquid REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS asset_styles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    asset TEXT NOT NULL,
    color_hex TEXT,
    risk_level TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, asset)
  )`,
  `CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY,
    show_zero_assets INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, tx_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_mm_user ON monthly_movements(user_id, direction)`,
  `CREATE INDEX IF NOT EXISTS idx_snap_user_date ON monthly_snapshots(user_id, snapshot_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_asset_style_user ON asset_styles(user_id, asset)`
];
