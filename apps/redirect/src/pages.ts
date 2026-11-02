/** Static fallback pages. No user input is ever interpolated into this HTML. */

const PAGES = {
  unknown: {
    title: "We can't find this code",
    body: "This StillScans link doesn't exist. Check that it was typed correctly.",
  },
  paused: {
    title: "This code is paused",
    body: "Its owner has paused it for now. Scan it again later, or contact the business that printed it.",
  },
  blocked: {
    title: "This code was stopped for safety",
    body: "We stopped this code because its destination was reported as unsafe. Nothing was opened.",
  },
  unavailable: {
    title: "Please try again",
    body: "We couldn't open this code just now. Scan it again in a moment.",
  },
} as const;

export type PageKind = keyof typeof PAGES;

export function render(kind: PageKind, status: number, env: { HOME_URL: string }): Response {
  const { title, body } = PAGES[kind];
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · StillScans</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:#FAFAF7;color:#0E1116;font:16px/26px Inter,system-ui,sans-serif}
main{max-width:440px;background:#fff;border:1px solid #E6E6E1;border-radius:12px;padding:28px}
h1{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.01em}
p{margin:12px 0 0;color:#5B6170}
a{color:#2346E8;font-weight:600}
</style>
</head>
<body><main><h1>${title}</h1><p>${body}</p><p><a href="${env.HOME_URL}">Go to StillScans</a></p></main></body>
</html>`;
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  };
  if (status === 503) headers["retry-after"] = "5";
  return new Response(html, { status, headers });
}
