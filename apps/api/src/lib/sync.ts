import { type Code, createDb, markSynced } from "@stillscans/db";
import { type KvCodeRecord, kvKey } from "@stillscans/shared";
import type { Env } from "../env";
import { errorFields, log } from "./log";

export function toKvRecord(code: Code): KvCodeRecord {
  const status = code.status === "archived" ? "paused" : code.status;
  return { d: code.destination, s: status };
}

/**
 * Copies a code to KV. D1 is the source of truth and has already committed, so a
 * failure here is logged, not thrown: `syncedVersion` stays behind `version` and
 * the scheduled job retries. Returns whether the write landed.
 */
export async function syncCodeToKv(env: Env, code: Code): Promise<boolean> {
  try {
    await env.KV.put(kvKey(code.shortCode), JSON.stringify(toKvRecord(code)));
    await markSynced(createDb(env.DB), code.id, code.version);
    return true;
  } catch (error) {
    log("error", "kv_sync_failed", { codeId: code.id, ...errorFields(error) });
    return false;
  }
}
