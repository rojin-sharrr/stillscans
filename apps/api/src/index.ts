import type { ScanEvent } from "@stillscans/shared";
import { createApp } from "./app";
import type { Env } from "./env";
import { runMaintenance } from "./jobs/maintenance";
import { consumeScans } from "./jobs/scans";

const app = createApp();

export default {
  fetch: app.fetch,
  queue: consumeScans,
  scheduled: (_event, env, ctx) => ctx.waitUntil(runMaintenance(env)),
} satisfies ExportedHandler<Env, ScanEvent>;
