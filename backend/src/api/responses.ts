import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";

export type ApiError = {
  code: string;
  message: string;
  fields?: Record<string, string>;
};

export function errorBody(
  code: string,
  message: string,
  fields?: Record<string, string>
): { error: ApiError } {
  return { error: fields ? { code, message, fields } : { code, message } };
}

export function jsonError(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400,
  fields?: Record<string, string>
): Response {
  return c.json(errorBody(code, message, fields), status);
}

export function jsonData<T>(
  c: Context,
  data: T,
  status: ContentfulStatusCode = 200
): Response {
  return c.json({ data }, status);
}

export function validateJson<T>(schema: ZodType<T>) {
  return zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return jsonError(c, "VALIDATION_ERROR", "Invalid request body", 400);
    }
  });
}
