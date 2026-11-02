import type { CheckEvent } from "@stillscans/shared";
import { normalizeUrl } from "@stillscans/url-safety";
import { describe, expect, it, vi } from "vitest";
import { classify } from "../src/checker/classify";
import { extractClientRedirect, extractText, extractTitle } from "../src/checker/html";
import { CheckIncompleteError, runCheck, UncheckableUrlError } from "../src/checker/pipeline";
import { traceUrl } from "../src/checker/trace";
import { type Routes, stubFetch, testCheckDeps } from "./helpers";

const url = (value: string) => {
  const result = normalizeUrl(value);
  if (!result.ok) throw new Error(value);
  return result.url;
};

const trace = (routes: Routes, start: string) => traceUrl(url(start), testCheckDeps(routes));

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html" } });
const moved = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

describe("html extraction", () => {
  it("reads titles and decodes entities", () => {
    expect(extractTitle("<title>Joe&#39;s Cafe</title>")).toBe("Joe's Cafe");
  });

  it("finds meta refresh in either attribute order", () => {
    const standard = '<meta http-equiv="refresh" content="0;url=https://a.com/x">';
    const reversed = '<meta content="0; url=https://a.com/x" http-equiv="refresh">';
    expect(extractClientRedirect(standard)).toEqual({
      target: "https://a.com/x",
      via: "meta-refresh",
    });
    expect(extractClientRedirect(reversed)?.target).toBe("https://a.com/x");
  });

  it("finds simple javascript redirects", () => {
    for (const script of [
      `window.location = "https://a.com/x"`,
      `location.href='https://a.com/x'`,
      `window.location.replace("https://a.com/x")`,
    ]) {
      expect(extractClientRedirect(`<script>${script}</script>`)).toEqual({
        target: "https://a.com/x",
        via: "js",
      });
    }
  });

  it("does not mistake a script on a real page for a redirect", () => {
    const page = `<p>${"Our menu and opening hours. ".repeat(20)}</p>
      <button onclick="location.href='/order'">Order</button>`;
    expect(extractClientRedirect(page)).toBeNull();
  });

  it("ignores pages with no redirect", () => {
    expect(extractClientRedirect("<p>Hello</p>")).toBeNull();
  });

  it("extracts visible text without scripts", () => {
    expect(extractText("<script>var a=1</script><h1>Code  expired</h1>")).toBe("Code expired");
  });
});

describe("traceUrl", () => {
  it("records every hop", async () => {
    const result = await trace(
      {
        "https://qrfy.com/r/abc": moved("https://joescafe.com/menu"),
        "https://joescafe.com/menu": html("<title>Menu</title>"),
      },
      "https://qrfy.com/r/abc",
    );
    expect(result.hops.map((hop) => [hop.host, hop.status, hop.via])).toEqual([
      ["qrfy.com", 302, "redirect"],
      ["joescafe.com", 200, "final"],
    ]);
    expect(result.outcome).toEqual({ kind: "loaded" });
    expect(result.title).toBe("Menu");
  });

  it("resolves relative redirects", async () => {
    const result = await trace(
      { "https://a.com/x": moved("/y"), "https://a.com/y": html("ok") },
      "https://a.com/x",
    );
    expect(result.hops.at(-1)?.url).toBe("https://a.com/y");
  });

  it("follows meta refresh", async () => {
    const result = await trace(
      {
        "https://a.com/": html('<meta http-equiv="refresh" content="0;url=https://b.com/">'),
        "https://b.com/": html("ok"),
      },
      "https://a.com/",
    );
    expect(result.hops[0]?.via).toBe("meta-refresh");
    expect(result.hops).toHaveLength(2);
  });

  it.each([
    "http://10.0.0.5/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::ffff:127.0.0.1]/",
    "http://localhost/",
  ])("refuses a redirect to internal address %s and never fetches it", async (target) => {
    const deps = testCheckDeps({ "https://a.com/": moved(target) });
    const result = await traceUrl(url("https://a.com/"), deps);
    expect(result.outcome.kind).toBe("refused");
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a public name that resolves to a private address", async () => {
    const deps = testCheckDeps(
      { "https://evil.example/": html("x") },
      { private: ["evil.example"] },
    );
    const result = await traceUrl(url("https://evil.example/"), deps);
    expect(result.outcome.kind).toBe("refused");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("detects redirect loops", async () => {
    const result = await trace(
      { "https://a.com/1": moved("/2"), "https://a.com/2": moved("/1") },
      "https://a.com/1",
    );
    expect(result.outcome).toEqual({ kind: "gone", reason: "redirect_loop" });
  });

  it("stops after ten hops without calling the code dead", async () => {
    const routes: Routes = {};
    for (let i = 0; i < 12; i++) routes[`https://a.com/${i}`] = moved(`/${i + 1}`);
    const result = await trace(routes, "https://a.com/0");
    expect(result.hops).toHaveLength(10);
    expect(result.outcome).toEqual({ kind: "unverified", reason: "too_many_hops" });
  });

  it("falls back to HEAD when GET is not allowed", async () => {
    const deps = testCheckDeps({});
    deps.fetch = vi.fn(async (_input, init) =>
      init?.method === "GET"
        ? new Response(null, { status: 405 })
        : new Response(null, { status: 200 }),
    ) as typeof fetch;
    const result = await traceUrl(url("https://a.com/"), deps);
    expect(result.outcome.kind).toBe("loaded");
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it("never treats a timeout as a dead code", async () => {
    const deps = testCheckDeps({});
    deps.fetch = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as typeof fetch;
    const result = await traceUrl(url("https://a.com/"), deps);
    expect(result.outcome).toEqual({ kind: "unverified", reason: "network" });
  });

  it("reports a domain that no longer exists", async () => {
    const deps = testCheckDeps({}, { nxdomain: ["gone.example"] });
    const result = await traceUrl(url("https://gone.example/"), deps);
    expect(result.outcome).toEqual({ kind: "gone", reason: "domain_gone" });
  });

  it("stops when the overall time budget runs out", async () => {
    let clock = 0;
    const deps = testCheckDeps({ "https://a.com/": moved("/2"), "https://a.com/2": moved("/3") });
    deps.now = () => {
      clock += 15_000;
      return clock;
    };
    const result = await traceUrl(url("https://a.com/"), deps);
    expect(result.outcome).toEqual({ kind: "unverified", reason: "budget" });
  });
});

describe("classify", () => {
  const verdictFor = async (routes: Routes, start: string, options = {}) => {
    const deps = testCheckDeps(routes, options);
    return classify(await traceUrl(url(start), deps));
  };

  it("static code on one site is safe", async () => {
    const result = await verdictFor(
      { "https://joescafe.com/menu": html("ok") },
      "https://joescafe.com/menu",
    );
    expect(result).toMatchObject({ verdict: "safe", codeType: "static", provider: null });
  });

  it("treats www and https upgrades as static", async () => {
    const result = await verdictFor(
      {
        "http://joescafe.com/": moved("https://www.joescafe.com/"),
        "https://www.joescafe.com/": html("ok"),
      },
      "http://joescafe.com/",
    );
    expect(result).toMatchObject({ verdict: "safe", codeType: "static" });
  });

  it("static page that is gone is dead, not safe", async () => {
    const result = await verdictFor({ "https://a.com/x": html("nope", 404) }, "https://a.com/x");
    expect(result).toMatchObject({ verdict: "dead", codeType: "static" });
  });

  it("known provider that forwards is at risk", async () => {
    const result = await verdictFor(
      {
        "https://qrco.de/bf4Y2u": moved("https://joescafe.com/menu"),
        "https://joescafe.com/menu": html("ok"),
      },
      "https://qrco.de/bf4Y2u",
    );
    expect(result).toMatchObject({
      verdict: "risk",
      codeType: "dynamic",
      reachability: "loads",
      provider: { slug: "qr-code-generator-pro", domain: "qrco.de" },
      unknownDomain: null,
    });
  });

  it("matches a provider by website when it redirects", async () => {
    const result = await verdictFor(
      {
        "https://qrfy.com/r/abc": moved("https://joescafe.com/menu"),
        "https://joescafe.com/menu": html("ok"),
      },
      "https://qrfy.com/r/abc",
    );
    expect(result).toMatchObject({ verdict: "risk", provider: { slug: "qrfy" } });
  });

  it("linking directly to a provider's website is not a dynamic code", async () => {
    const result = await verdictFor(
      { "https://hovercode.com/pricing": html("ok") },
      "https://hovercode.com/pricing",
    );
    expect(result).toMatchObject({ verdict: "safe", codeType: "static" });
  });

  it("unknown third-party redirect reports its domain", async () => {
    const result = await verdictFor(
      {
        "https://r.example-qr.net/7Hd2": moved("https://joescafe.com/menu"),
        "https://joescafe.com/menu": html("ok"),
      },
      "https://r.example-qr.net/7Hd2",
    );
    expect(result).toMatchObject({
      verdict: "risk",
      provider: null,
      unknownDomain: "r.example-qr.net",
    });
  });

  it("redirect domain with no destination is dead", async () => {
    const result = await verdictFor(
      { "https://qrco.de/abc": html("gone", 410) },
      "https://qrco.de/abc",
    );
    expect(result).toMatchObject({ verdict: "dead", provider: { slug: "qr-code-generator-pro" } });
  });

  it("a deactivated page is dead even though it returns 200", async () => {
    const result = await verdictFor(
      { "https://qrco.de/abc": html("<title>Oops</title><p>This code has been deactivated</p>") },
      "https://qrco.de/abc",
    );
    expect(result.verdict).toBe("dead");
  });

  it("a chain that ends on the provider's own site is dead", async () => {
    const result = await verdictFor(
      {
        "https://qrco.de/abc": moved("https://www.qr-code-generator.com/expired"),
        "https://www.qr-code-generator.com/expired": html("Upgrade today"),
      },
      "https://qrco.de/abc",
    );
    expect(result.verdict).toBe("dead");
  });

  it("does not apply deactivation phrases to static codes", async () => {
    const result = await verdictFor(
      { "https://blog.example/post": html("Why your QR code has expired: a guide") },
      "https://blog.example/post",
    );
    expect(result.verdict).toBe("safe");
  });

  it("a parked domain is dead", async () => {
    const result = await verdictFor(
      { "https://old.example/": html("This domain is for sale") },
      "https://old.example/",
    );
    expect(result.verdict).toBe("dead");
  });

  it.each([403, 429, 500, 503])("HTTP %i at the end of a chain is never dead", async (status) => {
    const result = await verdictFor(
      {
        "https://qrco.de/abc": moved("https://joescafe.com/"),
        "https://joescafe.com/": html("x", status),
      },
      "https://qrco.de/abc",
    );
    expect(result).toMatchObject({ verdict: "risk", reachability: "unverified" });
  });

  it("our own codes are safe", async () => {
    const result = await verdictFor(
      {
        "https://stillscans.net/x7k2": moved("https://joescafe.com/"),
        "https://joescafe.com/": html("ok"),
      },
      "https://stillscans.net/x7k2",
    );
    expect(result).toMatchObject({ verdict: "safe", ownCode: true, provider: null });
  });
});

describe("runCheck", () => {
  const collect = () => {
    const events: CheckEvent[] = [];
    return { events, emit: (event: CheckEvent) => events.push(event) };
  };

  it("reports all three steps in order", async () => {
    const { events, emit } = collect();
    const deps = testCheckDeps({ "https://joescafe.com/": html("ok") });
    await runCheck("id", { url: "joescafe.com" }, deps, emit);
    expect(events.map((e) => (e.type === "step" ? `${e.step}:${e.state}` : e.type))).toEqual([
      "reading:active",
      "reading:done",
      "following:active",
      "following:done",
      "controls:active",
      "controls:done",
    ]);
  });

  it("treats non-link payloads as text, without fetching", async () => {
    const deps = testCheckDeps({});
    const result = await runCheck("id", { decodedText: "WIFI:S:Cafe;P:pw;;" }, deps, () => {});
    expect(result).toMatchObject({ verdict: "safe", codeType: "text", hops: [] });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("carries the threat lookup through", async () => {
    const deps = testCheckDeps({ "https://a.com/": html("ok") }, { threat: "unsafe" });
    const result = await runCheck("id", { url: "https://a.com/" }, deps, () => {});
    expect(result.threat).toBe("unsafe");
  });

  it("gives no verdict when the first hop never answers", async () => {
    const deps = testCheckDeps({});
    deps.fetch = vi.fn(async () => {
      throw new TypeError("connection failed");
    }) as typeof fetch;
    await expect(
      runCheck("id", { url: "https://tinyurl.com/x" }, deps, () => {}),
    ).rejects.toBeInstanceOf(CheckIncompleteError);
  });

  it("still fetches when DNS is unavailable", async () => {
    const deps = testCheckDeps({ "https://a.com/": html("ok") });
    deps.resolve = async () => ({ status: "error" });
    const result = await runCheck("id", { url: "https://a.com/" }, deps, () => {});
    expect(result).toMatchObject({ verdict: "safe", reachability: "loads" });
  });

  it("keeps a known-provider verdict when a later hop fails", async () => {
    const deps = testCheckDeps({ "https://qrco.de/abc": moved("https://joescafe.com/") });
    const result = await runCheck("id", { url: "https://qrco.de/abc" }, deps, () => {});
    expect(result).toMatchObject({ verdict: "risk", reachability: "unverified" });
  });

  it("refuses internal targets", async () => {
    await expect(
      runCheck("id", { url: "http://127.0.0.1/" }, testCheckDeps({}), () => {}),
    ).rejects.toBeInstanceOf(UncheckableUrlError);
  });
});

it("stubFetch fails loudly on an unplanned URL", async () => {
  await expect(stubFetch({})("https://unplanned.example/")).rejects.toThrow(/unplanned/);
});
