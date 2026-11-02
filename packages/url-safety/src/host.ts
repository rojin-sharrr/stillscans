/**
 * SSRF defence: decides whether a host or IP may be contacted or stored as a
 * destination. The checker fetches user-supplied URLs, so anything internal must
 * be refused here. Input is expected to come from `new URL()`, which has already
 * normalised alternate IPv4 forms such as `2130706433` and `0x7f.1`.
 */

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa"];
const BLOCKED_NAMES = new Set(["localhost", "metadata.google.internal"]);

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  const valid = parts.every((p) => /^\d{1,3}$/.test(p)) && octets.every((n) => n <= 255);
  return valid ? octets : null;
}

function isPrivateIpv4([a = 0, b = 0, c = 0]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, including cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

function isPrivateIpv6(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "").toLowerCase();
  if (ip === "::" || ip === "::1") return true;
  if (/^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith("ff")) return true;

  // IPv4-mapped and IPv4-compatible addresses reach the same private hosts.
  const dotted = ip.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) {
    const octets = parseIpv4(dotted);
    return octets ? isPrivateIpv4(octets) : true;
  }
  const hexMapped = ip.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const high = Number.parseInt(hexMapped[1] ?? "0", 16);
    const low = Number.parseInt(hexMapped[2] ?? "0", 16);
    return isPrivateIpv4([high >> 8, high & 255, low >> 8, low & 255]);
  }
  return false;
}

export function isIpLiteral(host: string): boolean {
  return host.includes(":") || parseIpv4(host) !== null;
}

export function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) return isPrivateIpv6(ip);
  const octets = parseIpv4(ip);
  return octets ? isPrivateIpv4(octets) : true;
}

/** True for hostnames and IP literals that must never be contacted. */
export function isBlockedHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  if (!name || BLOCKED_NAMES.has(name)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  if (isIpLiteral(name)) return isPrivateIp(name);
  return !name.includes("."); // single-label names only resolve on internal networks
}
