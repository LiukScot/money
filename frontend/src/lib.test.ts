import { describe, expect, test, vi, afterEach } from "vitest";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch, formatCurrency } from "./lib.ts";

describe("formatCurrency", () => {
  test("formats positive number with currency symbol", () => {
    const out = formatCurrency(1234.5);
    expect(out).toMatch(/\p{Sc}/u);
    expect(out).toMatch(/1[.,]?234,50/);
  });

  test("formats zero", () => {
    const out = formatCurrency(0);
    expect(out).toMatch(/0,00/);
  });

  test("handles NaN as zero (PR #13 hoisted Intl regression)", () => {
    const out = formatCurrency(Number.NaN);
    expect(out).toMatch(/0,00/);
  });

  test("handles negative number", () => {
    const out = formatCurrency(-50);
    expect(out).toMatch(/50,00/);
    expect(out).toContain("-");
  });
});

describe("apiEnvelopeSchema", () => {
  test("wraps schema with data property", () => {
    const schema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));
    const parsed = schema.parse({ data: { ok: true } });
    expect(parsed.data.ok).toBe(true);
  });

  test("rejects missing data wrapper", () => {
    const schema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));
    expect(() => schema.parse({ ok: true })).toThrow();
  });
});

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("sends JSON content-type when body present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const schema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));
    const result = await apiFetch(
      "/api/x",
      { method: "POST", body: JSON.stringify({ a: 1 }) },
      (raw) => schema.parse(raw).data
    );
    expect(result.ok).toBe(true);
    const callInit = fetchMock.mock.calls[0][1];
    expect(callInit.headers["content-type"]).toBe("application/json");
    expect(callInit.credentials).toBe("include");
  });

  test("does not set content-type for FormData body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const fd = new FormData();
    fd.append("file", new Blob(["x"]), "x.bin");
    await apiFetch(
      "/api/upload",
      { method: "POST", body: fd },
      (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
    );
    const callInit = fetchMock.mock.calls[0][1];
    expect(callInit.headers["content-type"]).toBeUndefined();
  });

  test("throws with server error.message on non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } }),
        { status: 401, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      apiFetch("/api/v1/auth/login", { method: "POST" }, (raw) => raw)
    ).rejects.toThrow("Invalid credentials");
  });

  test("throws with HTTP status fallback when no error.message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiFetch("/api/x", { method: "GET" }, (raw) => raw)).rejects.toThrow("HTTP 500");
  });

  test("calls parser with parsed json on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { value: 42 } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const parser = vi.fn((raw: unknown) => (raw as { data: { value: number } }).data);
    const result = await apiFetch("/api/x", { method: "GET" }, parser);
    expect(parser).toHaveBeenCalledWith({ data: { value: 42 } });
    expect(result.value).toBe(42);
  });
});
