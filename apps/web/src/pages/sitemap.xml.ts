import { providers } from "@stillscans/providers";
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const paths = ["/", "/providers", ...providers.map((p) => `/providers/${p.slug}`)];
  const urls = paths.map((path) => {
    const provider = providers.find((p) => `/providers/${p.slug}` === path);
    const lastmod = provider?.verified ? `<lastmod>${provider.verified}</lastmod>` : "";
    return `<url><loc>${new URL(path, site)}</loc>${lastmod}</url>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
  return new Response(body, { headers: { "content-type": "application/xml" } });
};
