# myMoney (Bun + React)

Standalone myMoney project running on port `8001`.

## Stack

- Backend: Bun + TypeScript + SQLite
- Frontend: React + TypeScript + Vite
- Auth: cookie sessions (`MYMONEY_SESSID`) persisted in SQLite

## Quick start

1. Install deps:
   - `npm install`
   - `npm --prefix backend install`
   - `npm --prefix frontend install`
2. Run migrations:
   - `npm run migrate`
3. Create first user:
   - `npm run user -- create --email=you@example.com --password='StrongPass123' --name='You'`
4. Run backend and frontend (separate terminals):
   - `npm run dev:backend`
   - `npm run dev:frontend`

## Legacy migration from old myTools DB

Run:

```bash
MIGRATION_PRIMARY_EMAIL=you@example.com npm run migrate:legacy -- --fresh
```

This writes `data/mymoney-migration-report.json`.

## Data operations

- Backup DB: `npm run backup`
- Restore DB: `npm run restore -- --file=/absolute/path/to/backup.sqlite`

## Docker

- `docker compose up --build -d`
- No Redis service is required.

## Rollback helpers

- `rollback/legacy-runtime.tar.gz` stores pre-migration source snapshot.
- `scripts/rollback-runtime.sh` restores legacy files from that archive.
