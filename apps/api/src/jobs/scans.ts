import { createDb, insertScans } from "@stillscans/db";
import type { ScanEvent } from "@stillscans/shared";
import type { Env } from "../env";
import { errorFields, log } from "../lib/log";

/** Inserts a batch of scans. Throwing retries the batch; ids make that safe. */
export async function consumeScans(batch: MessageBatch<ScanEvent>, env: Env): Promise<void> {
  try {
    await insertScans(
      createDb(env.DB),
      batch.messages.map((message) => message.body),
    );
  } catch (error) {
    log("error", "scan_insert_failed", { size: batch.messages.length, ...errorFields(error) });
    throw error;
  }
}
