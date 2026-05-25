import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const smokePort = Number(process.env.SMOKE_PORT || process.env.PORT || 8901);
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const smokeDbDir = fs.mkdtempSync(path.join(os.tmpdir(), "mymoney-playwright-"));
const smokeDbPath = path.join(smokeDbDir, "smoke-mymoney.sqlite");
const quoteShell = (value: string) => JSON.stringify(value);

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: externalBaseURL || `http://127.0.0.1:${smokePort}`,
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: `rm -f ${quoteShell(smokeDbPath)} ${quoteShell(`${smokeDbPath}-shm`)} ${quoteShell(`${smokeDbPath}-wal`)} && DB_PATH=${quoteShell(smokeDbPath)} npm run smoke:seed && PORT=${smokePort} DB_PATH=${quoteShell(smokeDbPath)} LOGIN_RATE_LIMIT_MAX=0 npm run smoke:serve`,
        port: smokePort,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000
      }
});
