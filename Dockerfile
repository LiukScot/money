FROM oven/bun:1 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN bun install
COPY frontend/ ./
RUN bun run build

FROM oven/bun:1
WORKDIR /app

COPY backend/package.json backend/bun.lock ./backend/
RUN cd backend && bun install --production --frozen-lockfile

COPY backend/ ./backend/
COPY scripts/ ./scripts/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data

ENV HOST=0.0.0.0 \
    PORT=8001 \
    DB_PATH=/app/data/mymoney.sqlite

EXPOSE 8001
CMD ["bun", "--cwd", "backend", "src/server.ts"]
