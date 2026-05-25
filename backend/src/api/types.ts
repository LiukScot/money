import type { SQLiteDB } from "../db.ts";
import type { ApiEnv } from "../schemas.ts";
import type { RateLimiter } from "../rate-limit.ts";

export type SessionData = {
  sid: string;
  userId: number;
  email: string;
};

export type AuthedUser = {
  id: number;
  email: string;
  name: string | null;
};

export type AppEnv = {
  Bindings: Record<string, never>;
  Variables: {
    db: SQLiteDB;
    env: ApiEnv;
    session: SessionData;
    user: AuthedUser;
    loginRateLimiter: RateLimiter;
  };
};
