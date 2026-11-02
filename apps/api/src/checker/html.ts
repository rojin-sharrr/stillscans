/** Lightweight extraction from untrusted HTML. Patterns are linear; nothing is executed. */

const TITLE = /<title[^>]*>([^<]{0,300})/i;
const META_REFRESH =
  /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\s*\d*\s*;?\s*url=["']?([^"'>\s]+)/i;
const META_REFRESH_REVERSED =
  /<meta[^>]*content=["']?\s*\d*\s*;?\s*url=["']?([^"'>\s]+)["']?[^>]*http-equiv=["']?refresh/i;
const JS_REDIRECT =
  /\b(?:window\.|document\.|top\.|self\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']|\blocation\.(?:replace|assign)\(\s*["']([^"']+)["']\s*\)/i;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&#x2F;": "/",
};

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39|#x27|#x2F);/g, (m) => ENTITIES[m] ?? m);
}

export function extractTitle(html: string): string | null {
  const title = html.match(TITLE)?.[1]?.trim();
  return title ? decodeEntities(title) : null;
}

export interface ClientRedirect {
  target: string;
  via: "meta-refresh" | "js";
}

/** Above this much visible text a page is real content, not a "redirecting..." interstitial. */
const INTERSTITIAL_MAX_TEXT = 300;

export function extractClientRedirect(html: string): ClientRedirect | null {
  const meta = html.match(META_REFRESH)?.[1] ?? html.match(META_REFRESH_REVERSED)?.[1];
  if (meta) return { target: decodeEntities(meta), via: "meta-refresh" };

  // Real pages assign `location` inside click handlers too. Only a near-empty page
  // can be read as a redirect, or a working site would be reported as forwarding.
  if (extractText(html).length > INTERSTITIAL_MAX_TEXT) return null;
  const js = html.match(JS_REDIRECT);
  const target = js?.[1] ?? js?.[2];
  return target ? { target: decodeEntities(target), via: "js" } : null;
}

/** Visible text, for matching "this code has been deactivated" style pages. */
export function extractText(html: string, maxLength = 4000): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
