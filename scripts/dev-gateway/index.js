/**
 * Local development only; never deployed. Queues only connect Workers in the same
 * process, and wrangler exposes one port per process, so this splits that port:
 * /api and /health go to api, and everything else is a short code for redirect.
 */
export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    const isApi = pathname === "/health" || pathname.startsWith("/api/");
    return (isApi ? env.API : env.REDIRECT).fetch(request);
  },
};
