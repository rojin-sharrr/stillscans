import type { ScanEvent } from "@stillscans/shared";
import { and, desc, eq, gt, gte, lt, lte, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { codeDestinations, codes, scans } from "./schema";

export type Db = ReturnType<typeof createDb>;
export type Code = typeof schema.codes.$inferSelect;

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export async function findSessionUser(db: Db, tokenHash: string, now: number) {
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.tokenHash, tokenHash), gt(schema.sessions.expiresAt, now)))
    .limit(1);
  return row?.user ?? null;
}

export function listCodes(db: Db, userId: string) {
  return db
    .select()
    .from(codes)
    .where(and(eq(codes.userId, userId), ne(codes.status, "archived")))
    .orderBy(desc(codes.createdAt));
}

/** Every code, archived included: the export promise covers all of them. */
export function listAllCodes(db: Db, userId: string) {
  return db.select().from(codes).where(eq(codes.userId, userId)).orderBy(desc(codes.createdAt));
}

export async function countLiveCodes(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(codes)
    .where(and(eq(codes.userId, userId), ne(codes.status, "archived")));
  return row?.count ?? 0;
}

export async function findUserCode(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(codes)
    .where(and(eq(codes.id, id), eq(codes.userId, userId)))
    .limit(1);
  return row ?? null;
}

export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    if (current.message.includes("UNIQUE constraint failed")) return true;
    seen.add(current);
    current = current.cause;
  }
  return false;
}

interface NewCode {
  id: string;
  historyId: string;
  shortCode: string;
  userId: string;
  destination: string;
  label: string | null;
  now: number;
}

/** Writes the code and its first destination together. Throws on a short-code collision. */
export async function insertCode(db: Db, code: NewCode): Promise<Code> {
  const { id, historyId, shortCode, userId, destination, label, now } = code;
  const [rows] = await db.batch([
    db
      .insert(codes)
      .values({ id, shortCode, userId, destination, label, createdAt: now, updatedAt: now })
      .returning(),
    db.insert(codeDestinations).values({ id: historyId, codeId: id, destination, createdAt: now }),
  ]);
  const row = rows[0];
  if (!row) throw new Error("Insert returned no row");
  return row;
}

type CodeChanges = Partial<Pick<Code, "destination" | "label" | "status">>;

/**
 * Applies a change, bumping `version` if it affects the KV record so that a failed
 * KV write is retried. `historyId` records a destination change in the same batch.
 */
export async function updateCode(
  db: Db,
  code: Code,
  changes: CodeChanges,
  now: number,
  historyId: string | null,
): Promise<Code> {
  const affectsKv = changes.destination !== undefined || changes.status !== undefined;
  const update = db
    .update(codes)
    .set({ ...changes, updatedAt: now, version: code.version + (affectsKv ? 1 : 0) })
    .where(eq(codes.id, code.id))
    .returning();

  if (historyId && changes.destination !== undefined) {
    const [rows] = await db.batch([
      update,
      db.insert(codeDestinations).values({
        id: historyId,
        codeId: code.id,
        destination: changes.destination,
        createdAt: now,
      }),
    ]);
    if (!rows[0]) throw new Error("Update returned no row");
    return rows[0];
  }
  const [row] = await update;
  if (!row) throw new Error("Update returned no row");
  return row;
}

export function listDestinations(db: Db, codeId: string) {
  return db
    .select()
    .from(codeDestinations)
    .where(eq(codeDestinations.codeId, codeId))
    .orderBy(desc(codeDestinations.createdAt));
}

/** `version` guards a concurrent edit: only the version actually written counts as synced. */
export async function markSynced(db: Db, id: string, version: number): Promise<void> {
  await db
    .update(codes)
    .set({ syncedVersion: sql`max(${codes.syncedVersion}, ${version})` })
    .where(eq(codes.id, id));
}

export function listUnsyncedCodes(db: Db, limit: number) {
  return db.select().from(codes).where(lt(codes.syncedVersion, codes.version)).limit(limit);
}

export async function insertScans(db: Db, events: ScanEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db.insert(scans).values(events).onConflictDoNothing();
}

export async function scanStats(db: Db, shortCode: string, since: number) {
  const scoped = and(eq(scans.shortCode, shortCode), gte(scans.scannedAt, since));
  const day = sql<string>`date(${scans.scannedAt} / 1000, 'unixepoch')`;
  const count = sql<number>`count(*)`;

  const [byDay, byDevice, byCity] = await db.batch([
    db.select({ day, count }).from(scans).where(scoped).groupBy(day).orderBy(day),
    db
      .select({ deviceType: scans.deviceType, count })
      .from(scans)
      .where(scoped)
      .groupBy(scans.deviceType),
    db
      .select({ city: scans.city, country: scans.country, count })
      .from(scans)
      .where(scoped)
      .groupBy(scans.city, scans.country)
      .orderBy(desc(count))
      .limit(20),
  ]);
  return { byDay, byDevice, byCity };
}

export async function insertCheck(
  db: Db,
  check: { id: string; inputHash: string; result: string; createdAt: number },
): Promise<void> {
  await db.insert(schema.checks).values(check);
}

export async function findCheck(db: Db, id: string) {
  const [row] = await db.select().from(schema.checks).where(eq(schema.checks.id, id)).limit(1);
  return row ?? null;
}

export async function findRecentCheck(db: Db, inputHash: string, since: number) {
  const [row] = await db
    .select()
    .from(schema.checks)
    .where(and(eq(schema.checks.inputHash, inputHash), gt(schema.checks.createdAt, since)))
    .orderBy(desc(schema.checks.createdAt))
    .limit(1);
  return row ?? null;
}

export async function deleteChecksBefore(db: Db, cutoff: number): Promise<void> {
  await db.delete(schema.checks).where(lte(schema.checks.createdAt, cutoff));
}

export async function deleteExpiredSessions(db: Db, now: number): Promise<void> {
  await db.delete(schema.sessions).where(lte(schema.sessions.expiresAt, now));
}

export async function recordUnknownDomain(db: Db, domain: string, now: number): Promise<void> {
  await db
    .insert(schema.unknownDomains)
    .values({ domain, firstSeen: now, lastSeen: now })
    .onConflictDoUpdate({
      target: schema.unknownDomains.domain,
      set: { count: sql`${schema.unknownDomains.count} + 1`, lastSeen: now },
    });
}

export async function insertReport(
  db: Db,
  report: typeof schema.providerReports.$inferInsert,
): Promise<void> {
  await db.insert(schema.providerReports).values(report);
}
