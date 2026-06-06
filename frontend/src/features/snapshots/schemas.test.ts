import { describe, expect, test } from "vitest";
import { snapFormSchema } from "./schemas";

describe("snapFormSchema", () => {
  test("coerces empty string liquid to 0 on submit", () => {
    const result = snapFormSchema.parse({ snapshotDate: "2026-01-31", liquid: "" });
    expect(result.liquid).toBe(0);
  });

  test("preserves numeric liquid value when present", () => {
    const result = snapFormSchema.parse({ snapshotDate: "2026-01-31", liquid: 500 });
    expect(result.liquid).toBe(500);
  });
});
