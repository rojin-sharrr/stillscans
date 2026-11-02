import {
  createDb,
  deleteChecksBefore,
  deleteExpiredSessions,
  listUnsyncedCodes,
} from "@stillscans/db";
import type { Env } from "../env";
import { log } from "../lib/log";
import { syncCodeToKv } from "../lib/sync";

const CHECK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SYNC_BATCH_SIZE = 200;

/** Runs on a schedule. Each task is independent, so one failure can't block the others. */
export async function runMaintenance(env: Env, now = Date.now()): Promise<void> {
  const { db, close } = createDb(env.HYPERDRIVE.connectionString);
  const results = await Promise.allSettled([
    (async () => {
      const pending = await listUnsyncedCodes(db, SYNC_BATCH_SIZE);
      const synced = await Promise.all(pending.map((code) => syncCodeToKv(env, db, code)));
      const failed = synced.filter((ok) => !ok).length;
      if (pending.length > 0) log("info", "kv_resync", { pending: pending.length, failed });
    })(),
    deleteChecksBefore(db, now - CHECK_RETENTION_MS),
    deleteExpiredSessions(db, now),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      log("error", "maintenance_task_failed", { error: String(result.reason) });
    }
  }
  await close().catch(() => {});
}
