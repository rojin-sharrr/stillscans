import { describe, expect, it, vi } from "vitest";
import {
  createSafeBrowsingChecker,
  isBlockedHost,
  isPrivateIp,
  isSameSite,
  normalizeUrl,
  resolveHost,
} from "../src";

describe("normalizeUrl", () => {
  it("assumes https for bare hosts", () => {
    const result = normalizeUrl("qrfy.com/r/abc");
    expect(result.ok && result.url.href).toBe("https://qrfy.com/r/abc");
  });

  it.each([
    ["javascript:alert(1)", "unsupported_scheme"],
    ["ftp://example.com", "unsupported_scheme"],
    ["https://user:pw@example.com", "has_credentials"],
    ["http://localhost:8080/x", "blocked_host"],
    ["localhost:8080/x", "blocked_host"],
    ["http://127.0.0.1", "blocked_host"],
    ["http://2130706433", "blocked_host"],
    ["http://0x7f.1", "blocked_host"],
    ["http://169.254.169.254/latest/meta-data", "blocked_host"],
    ["http://[::1]/", "blocked_host"],
    ["http://[::ffff:127.0.0.1]/", "blocked_host"],
    ["http://[::ffff:169.254.169.254]/", "blocked_host"],
    ["http://intranet/", "blocked_host"],
    ["https://example.com:6379", "blocked_host"],
    ["https://", "invalid_url"],
  ])("rejects %s", (input, reason) => {
    expect(normalizeUrl(input)).toEqual({ ok: false, reason });
  });

  it("rejects URLs over the length limit", () => {
    expect(normalizeUrl(`https://a.com/${"x".repeat(2100)}`)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });
});

describe("host rules", () => {
  it("allows public hosts and addresses", () => {
    expect(isBlockedHost("joescafe.com")).toBe(false);
    expect(isBlockedHost("8.8.8.8")).toBe(false);
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });

  it.each(["10.0.0.1", "172.16.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "fd00::1", "fe80::1"])(
    "treats %s as private",
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );

  it("compares sites across www and subdomains", () => {
    expect(isSameSite("www.joescafe.com", "joescafe.com")).toBe(true);
    expect(isSameSite("go.joescafe.com", "joescafe.com")).toBe(true);
    expect(isSameSite("qrfy.com", "joescafe.com")).toBe(false);
    expect(isSameSite("notjoescafe.com", "joescafe.com")).toBe(false);
  });
});

const dohFetcher = (a: unknown, aaaa: unknown = { Status: 0 }) =>
  vi.fn(async (url: string | URL | Request) =>
    Response.json(String(url).includes("type=AAAA") ? aaaa : a),
  ) as unknown as typeof fetch;

describe("resolveHost", () => {
  it("returns public addresses", async () => {
    const fetcher = dohFetcher({ Status: 0, Answer: [{ type: 1, data: "93.184.216.34" }] });
    expect(await resolveHost("example.com", fetcher)).toEqual({
      status: "ok",
      addresses: ["93.184.216.34"],
    });
  });

  it("flags a public name that points at a private address", async () => {
    const fetcher = dohFetcher({ Status: 0, Answer: [{ type: 1, data: "10.0.0.8" }] });
    expect(await resolveHost("rebind.example", fetcher)).toEqual({ status: "private" });
  });

  it("ignores CNAME records in the answer", async () => {
    const fetcher = dohFetcher({
      Status: 0,
      Answer: [
        { type: 5, data: "target.example." },
        { type: 1, data: "93.184.216.34" },
      ],
    });
    expect((await resolveHost("alias.example", fetcher)).status).toBe("ok");
  });

  it("reports a domain that no longer exists", async () => {
    const fetcher = dohFetcher({ Status: 3 }, { Status: 3 });
    expect(await resolveHost("gone.example", fetcher)).toEqual({ status: "nxdomain" });
  });

  it("falls back to the second resolver", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("cloudflare-dns")
        ? new Response("", { status: 503 })
        : Response.json({ Status: 0, Answer: [{ type: 1, data: "93.184.216.34" }] }),
    ) as unknown as typeof fetch;
    expect((await resolveHost("example.com", fetcher)).status).toBe("ok");
  });

  it("reports resolver failure rather than guessing", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 500 })) as typeof fetch;
    expect(await resolveHost("example.com", fetcher)).toEqual({ status: "error" });
  });
});

describe("safe browsing", () => {
  it("is unknown without a key, and on failure", async () => {
    expect(await createSafeBrowsingChecker(undefined).check("https://a.com")).toBe("unknown");
    const failing = vi.fn(async () => new Response("", { status: 503 })) as typeof fetch;
    expect(await createSafeBrowsingChecker("k", failing).check("https://a.com")).toBe("unknown");
  });

  it("maps matches to unsafe", async () => {
    const hit = vi.fn(async () => Response.json({ matches: [{}] })) as typeof fetch;
    const miss = vi.fn(async () => Response.json({})) as typeof fetch;
    expect(await createSafeBrowsingChecker("k", hit).check("https://a.com")).toBe("unsafe");
    expect(await createSafeBrowsingChecker("k", miss).check("https://a.com")).toBe("safe");
  });
});
