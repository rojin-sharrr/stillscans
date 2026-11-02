import type { KvCodeRecord, ScanEvent } from "@stillscans/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Env, handle } from "../src/index";

const ctx = {
  waitUntil: (promise: Promise<unknown>) => void promise.catch(() => {}),
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

function makeEnv(records: Record<string, KvCodeRecord>) {
  const send = vi.fn<(event: ScanEvent) => Promise<void>>(async () => {});
  const env = {
    HOME_URL: "https://usestillscans.com/",
    KV: { get: vi.fn(async (key: string) => records[key] ?? null) },
    SCANS: { send },
  } as unknown as Env;
  return { env, send };
}

const get = (path: string, init?: RequestInit) =>
  new Request(`https://stillscans.net${path}`, init);

describe("redirect", () => {
  let fixture: ReturnType<typeof makeEnv>;

  beforeEach(() => {
    fixture = makeEnv({
      "code:x7k2": { d: "https://joescafe.com/menu", s: "active" },
      "code:paus": { d: "https://joescafe.com", s: "paused" },
      "code:bad2": { d: "https://bad.example", s: "blocked" },
      "code:evxy": { d: "javascript:alert(1)", s: "active" },
    });
  });

  it("redirects a valid code and is never cached", async () => {
    const res = await handle(get("/x7k2"), fixture.env, ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://joescafe.com/menu");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("treats printed codes as case-insensitive", async () => {
    expect((await handle(get("/X7K2"), fixture.env, ctx)).status).toBe(302);
  });

  it("logs one scan, without personal data", async () => {
    const request = get("/x7k2", { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } });
    await handle(request, fixture.env, ctx);
    await vi.waitFor(() => expect(fixture.send).toHaveBeenCalledOnce());
    const event = fixture.send.mock.calls[0]?.[0];
    expect(event).toMatchObject({ shortCode: "x7k2", deviceType: "mobile", os: "ios" });
    expect(Object.keys(event ?? {}).sort()).toEqual(
      [
        "city",
        "country",
        "deviceType",
        "id",
        "os",
        "region",
        "scannedAt",
        "shortCode",
        "visitorHash",
      ].sort(),
    );
  });

  it("hashes visitors without ever sending the IP", async () => {
    const env = { ...fixture.env, SCAN_SALT: "secret" };
    const headers = { "user-agent": "Mozilla/5.0 (iPhone)", "cf-connecting-ip": "203.0.113.9" };
    await handle(get("/x7k2", { headers }), env, ctx);
    await handle(get("/x7k2", { headers }), env, ctx);
    await vi.waitFor(() => expect(fixture.send).toHaveBeenCalledTimes(2));
    const [first, second] = fixture.send.mock.calls.map(([event]) => event);
    expect(first?.visitorHash).toMatch(/^[0-9a-f]{24}$/);
    expect(first?.visitorHash).toBe(second?.visitorHash);
    expect(JSON.stringify(first)).not.toContain("203.0.113.9");
  });

  it("leaves the visitor hash empty without a salt", async () => {
    await handle(get("/x7k2"), fixture.env, ctx);
    await vi.waitFor(() => expect(fixture.send).toHaveBeenCalledOnce());
    expect(fixture.send.mock.calls[0]?.[0].visitorHash).toBeNull();
  });

  it.each([
    ["user-agent", "Googlebot/2.1"],
    ["user-agent", "facebookexternalhit/1.1"],
    ["sec-purpose", "prefetch"],
  ])("redirects but does not count %s: %s", async (header, value) => {
    const res = await handle(get("/x7k2", { headers: { [header]: value } }), fixture.env, ctx);
    expect(res.status).toBe(302);
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("still redirects when scan logging fails", async () => {
    fixture.send.mockRejectedValueOnce(new Error("queue down"));
    expect((await handle(get("/x7k2"), fixture.env, ctx)).status).toBe(302);
  });

  it("does not count HEAD requests as scans", async () => {
    const res = await handle(get("/x7k2", { method: "HEAD" }), fixture.env, ctx);
    expect(res.status).toBe(302);
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("shows a friendly page for an unknown code", async () => {
    const res = await handle(get("/nope"), fixture.env, ctx);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("We can't find this code");
  });

  it("does not reach KV for malformed paths", async () => {
    const res = await handle(get("/../etc/passwd"), fixture.env, ctx);
    expect(res.status).toBe(404);
    expect(fixture.env.KV.get).not.toHaveBeenCalled();
  });

  it("warns instead of redirecting for a blocked code", async () => {
    const res = await handle(get("/bad2"), fixture.env, ctx);
    expect(res.status).toBe(410);
    expect(res.headers.get("location")).toBeNull();
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("does not redirect a paused code", async () => {
    const res = await handle(get("/paus"), fixture.env, ctx);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("paused");
  });

  it("refuses a non-http destination even if one reaches KV", async () => {
    const res = await handle(get("/evxy"), fixture.env, ctx);
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns a retryable page when KV fails", async () => {
    vi.mocked(fixture.env.KV.get).mockRejectedValueOnce(new Error("kv down"));
    const res = await handle(get("/x7k2"), fixture.env, ctx);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
  });

  it("sends the bare domain to the website and rejects writes", async () => {
    const home = await handle(get("/"), fixture.env, ctx);
    expect(home.headers.get("location")).toBe("https://usestillscans.com/");
    expect((await handle(get("/x7k2", { method: "POST" }), fixture.env, ctx)).status).toBe(405);
  });
});
