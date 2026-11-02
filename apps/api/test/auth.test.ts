import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { call, createTestApp, createTestBindings, createTestEnv, seedUser } from "./helpers";

let bindings: Awaited<ReturnType<typeof createTestBindings>>;
let env: Env;
const ORIGIN = { origin: "https://usestillscans.com" };

const CLEAR = ["sessions", "code_destinations", "codes", "users"];

beforeAll(async () => {
  bindings = await createTestBindings();
}, 30_000);
afterAll(async () => {
  await bindings.mf.dispose();
  await bindings.client.close();
});
beforeEach(async () => {
  await bindings.DB.batch(CLEAR.map((table) => bindings.DB.prepare(`DELETE FROM ${table}`)));
  env = googleEnv();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const sessionCookie = (res: Response) =>
  res.headers.getSetCookie().find((cookie) => cookie.startsWith("ss_session="));

const GOOGLE = { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret" };
const googleEnv = () => createTestEnv(bindings, GOOGLE);

const idToken = (claims: object) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.s`;
const good = {
  aud: "client",
  iss: "https://accounts.google.com",
  exp: Date.now() / 1000 + 300,
  email: "G@Example.com",
  email_verified: true,
};

function withToken(claims: object) {
  return createTestApp({
    "https://oauth2.googleapis.com/token": Response.json({ id_token: idToken(claims) }),
  });
}

async function begin(fixture: ReturnType<typeof createTestApp>, testEnv: Env) {
  const res = await call(fixture.app, testEnv, "/api/auth/google");
  const location = new URL(res.headers.get("location") ?? "");
  const cookie = res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
  return { location, cookie, state: location.searchParams.get("state") ?? "" };
}

async function signIn(fixture: ReturnType<typeof createTestApp>, testEnv: Env) {
  const { cookie, state } = await begin(fixture, testEnv);
  const res = await call(fixture.app, testEnv, `/api/auth/google/callback?code=c&state=${state}`, {
    headers: { cookie },
  });
  return { res, cookie: sessionCookie(res)?.split(";")[0] ?? "" };
}

describe("sessions", () => {
  it("authenticates by cookie and reports the allowance", async () => {
    const fixture = withToken(good);
    const { cookie } = await signIn(fixture, env);
    const res = await call(fixture.app, env, "/api/auth/me", { headers: { cookie } });
    expect(await res.json()).toEqual({ email: "g@example.com", codeAllowance: 5, liveCodes: 0 });
  });

  it("blocks cookie writes from another site", async () => {
    const fixture = withToken(good);
    const { cookie } = await signIn(fixture, env);
    const res = await call(fixture.app, env, "/api/codes", {
      method: "POST",
      json: { destination: "https://a.com/" },
      headers: { cookie, origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    expect(await bindings.DB.prepare("SELECT id FROM codes").first()).toBeNull();
  });

  it("allows cookie writes from our own site", async () => {
    const fixture = withToken(good);
    const { cookie } = await signIn(fixture, env);
    const res = await call(fixture.app, env, "/api/codes", {
      method: "POST",
      json: { destination: "https://a.com/" },
      headers: { cookie, ...ORIGIN },
    });
    expect(res.status).toBe(201);
  });

  it("logging out ends the session on the server", async () => {
    const fixture = withToken(good);
    const { cookie } = await signIn(fixture, env);
    await call(fixture.app, env, "/api/auth/logout", {
      method: "POST",
      headers: { cookie, ...ORIGIN },
    });
    expect((await call(fixture.app, env, "/api/auth/me", { headers: { cookie } })).status).toBe(
      401,
    );
  });

  it("sends credentials through CORS for the web origin only", async () => {
    const { app } = createTestApp();
    const res = await call(app, env, "/api/auth/config", { headers: ORIGIN });
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN.origin);
  });
});

describe("google sign-in", () => {
  it("creates a secure session and one account per email", async () => {
    const fixture = withToken(good);
    const testEnv = googleEnv();
    const { res } = await signIn(fixture, testEnv);
    const cookie = sessionCookie(res) ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    await signIn(withToken(good), testEnv);
    expect(await bindings.DB.prepare("SELECT count(*)::int AS n FROM users").first()).toEqual({
      n: 1,
    });
  });

  it("is hidden until configured", async () => {
    const { app } = createTestApp();
    const unconfigured = createTestEnv(bindings);
    expect(await (await call(app, unconfigured, "/api/auth/config")).json()).toEqual({
      google: false,
    });
    expect((await call(app, unconfigured, "/api/auth/google")).status).toBe(404);
  });

  it("uses state and PKCE", async () => {
    const { location, cookie, state } = await begin(createTestApp(), googleEnv());
    expect(location.hostname).toBe("accounts.google.com");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    // Google rejects anything but an exact match with the console, whatever host served us.
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://api.usestillscans.com/api/auth/google/callback",
    );
    expect(cookie).toContain(state);
  });

  it("signs in with a verified email and normalises it", async () => {
    const fixture = withToken(good);
    const testEnv = googleEnv();
    const { cookie, state } = await begin(fixture, testEnv);
    const res = await call(
      fixture.app,
      testEnv,
      `/api/auth/google/callback?code=c&state=${state}`,
      {
        headers: { cookie },
      },
    );
    expect(res.headers.get("location")).toBe("https://usestillscans.com/sign-in/verify");
    expect(sessionCookie(res)).toBeDefined();
    expect(await bindings.DB.prepare("SELECT email FROM users").first()).toEqual({
      email: "g@example.com",
    });
  });

  it("rejects a mismatched state", async () => {
    const fixture = withToken(good);
    const testEnv = googleEnv();
    const { cookie } = await begin(fixture, testEnv);
    const res = await call(fixture.app, testEnv, "/api/auth/google/callback?code=c&state=forged", {
      headers: { cookie },
    });
    expect(res.headers.get("location")).toContain("/sign-in?error=google");
    expect(sessionCookie(res)).toBeUndefined();
  });

  it.each([
    ["an unverified email", { ...good, email_verified: false }],
    ["another app's token", { ...good, aud: "other" }],
    ["an expired token", { ...good, exp: 1 }],
    ["another issuer", { ...good, iss: "https://evil.example" }],
  ])("rejects %s", async (_name, claims) => {
    const fixture = withToken(claims);
    const testEnv = googleEnv();
    const { cookie, state } = await begin(fixture, testEnv);
    const res = await call(
      fixture.app,
      testEnv,
      `/api/auth/google/callback?code=c&state=${state}`,
      {
        headers: { cookie },
      },
    );
    expect(res.headers.get("location")).toContain("/sign-in?error=google");
    expect(sessionCookie(res)).toBeUndefined();
  });
});

describe("analytics", () => {
  const scan = (id: string, shortCode: string, overrides: object = {}) => ({
    body: {
      id,
      shortCode,
      scannedAt: Date.now(),
      country: "US",
      region: "Texas",
      city: "Austin",
      deviceType: "mobile",
      os: "ios",
      visitorHash: `v-${id}`,
      ...overrides,
    },
  });

  async function seed() {
    const fixture = createTestApp();
    const token = await seedUser(bindings.DB, "u1");
    const create = async (label: string) => {
      const res = await call(fixture.app, env, "/api/codes", {
        method: "POST",
        token,
        json: { destination: "https://a.com/", label },
      });
      return ((await res.json()) as { code: { id: string; shortCode: string } }).code;
    };
    const sign = await create("Yard sign");
    const flyer = await create("Flyer");
    const { consumeScans } = await import("../src/jobs/scans");
    await consumeScans(
      {
        messages: [
          scan("a", sign.shortCode),
          scan("b", sign.shortCode, { visitorHash: "v-a" }),
          scan("c", sign.shortCode, {
            deviceType: "desktop",
            os: "mac",
            country: "CA",
            city: "Toronto",
            region: "Ontario",
          }),
          scan("d", flyer.shortCode, { scannedAt: Date.now() - 40 * 86_400_000 }),
        ],
      } as unknown as MessageBatch<never>,
      env,
    );
    return { ...fixture, token, sign, flyer };
  }

  beforeEach(() => bindings.DB.prepare("DELETE FROM scans").run());

  const get = async (fixture: { app: Parameters<typeof call>[0] }, token: string, query: string) =>
    (await (await call(fixture.app, env, `/api/analytics?${query}`, { token })).json()) as {
      totals: { scans: number; visitors: number };
      byDay: { scans: number }[];
      byDevice: { key: string; scans: number }[];
      byOs: { key: string; scans: number }[];
      byLocation: { city: string }[];
      byCode: { label: string; scans: number }[];
      recent: { city: string }[];
    };

  it("summarises every code by default and respects the date range", async () => {
    const s = await seed();
    expect((await get(s, s.token, "days=30")).totals.scans).toBe(3);
    expect((await get(s, s.token, "days=90")).totals.scans).toBe(4);
  });

  it("estimates distinct visitors from the hash", async () => {
    const s = await seed();
    expect((await get(s, s.token, "days=30")).totals).toEqual({ scans: 3, visitors: 2 });
  });

  it("fills empty days so the chart spans the range", async () => {
    const s = await seed();
    const { byDay } = await get(s, s.token, "days=7");
    expect(byDay).toHaveLength(7);
    expect(byDay.at(-1)?.scans).toBe(3);
  });

  it("breaks scans down by placement, place and device", async () => {
    const s = await seed();
    const data = await get(s, s.token, "days=90");
    expect(data.byCode[0]).toMatchObject({ label: "Yard sign", scans: 3 });
    expect(data.byLocation[0]?.city).toBe("Austin");
    expect(data.byDevice[0]).toEqual({ key: "mobile", scans: 3 });
    expect(data.byOs[0]).toEqual({ key: "ios", scans: 3 });
  });

  it("filters by code, device and country", async () => {
    const s = await seed();
    expect((await get(s, s.token, `days=30&codeId=${s.flyer.id}`)).totals.scans).toBe(0);
    expect((await get(s, s.token, "days=30&device=desktop")).totals.scans).toBe(1);
    expect((await get(s, s.token, "days=30&country=CA")).byLocation[0]?.city).toBe("Toronto");
  });

  it("shows nothing that could identify a person", async () => {
    const s = await seed();
    const body = JSON.stringify(await get(s, s.token, "days=30"));
    expect(body).not.toContain("v-a");
    expect(body).not.toContain("visitorHash");
  });

  it("never shows another account's scans", async () => {
    const s = await seed();
    const other = await seedUser(bindings.DB, "u2");
    expect((await get(s, other, "days=30")).totals.scans).toBe(0);
    const res = await call(s.app, env, `/api/analytics?codeId=${s.sign.id}`, { token: other });
    expect(res.status).toBe(404);
  });

  it("rejects unknown ranges and requires a session", async () => {
    const s = await seed();
    expect((await call(s.app, env, "/api/analytics?days=11", { token: s.token })).status).toBe(400);
    expect((await call(s.app, env, "/api/analytics")).status).toBe(401);
  });
});
