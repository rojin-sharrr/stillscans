import type { ScanEvent } from "@stillscans/shared";
import { and, desc, eq, gt, gte, lt, lte, ne, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { codeDestinations, codes, scans } from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Code = typeof schema.codes.$inferSelect;

/**
 * Workers can't reuse a connection across requests, so each request gets its own
 * small pool. Hyperdrive holds the real connections to Neon behind this.
 */
export function createDb(connectionString: string): { db: Db; close: () => Promise<void> } {
  const pool = new Pool({ connectionString, max: 5 });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
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

export async function findUserById(db: Db, id: string) {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return row ?? null;
}

/** Finds or creates the account for a verified email. Safe under concurrent sign-ins. */
export async function upsertUser(db: Db, id: string, email: string, now: number) {
  await db
    .insert(schema.users)
    .values({ id, email, createdAt: now })
    .onConflictDoNothing({ target: schema.users.email });
  const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!row) throw new Error("User missing after upsert");
  return row;
}

export async function insertSession(
  db: Db,
  session: typeof schema.sessions.$inferInsert,
): Promise<void> {
  await db.insert(schema.sessions).values(session);
}

export async function deleteSession(db: Db, tokenHash: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash));
}

export async function listCodes(db: Db, userId: string) {
  const scanCount = db
    .select({ shortCode: scans.shortCode, total: sql<number>`count(*)::int`.as("total") })
    .from(scans)
    .groupBy(scans.shortCode)
    .as("scan_count");
  const rows = await db
    .select({ code: codes, scans: scanCount.total })
    .from(codes)
    .leftJoin(scanCount, eq(codes.shortCode, scanCount.shortCode))
    .where(and(eq(codes.userId, userId), ne(codes.status, "archived")))
    .orderBy(desc(codes.createdAt));
  return rows.map((row) => ({ ...row.code, scans: row.scans ?? 0 }));
}

/** Every code, archived included: the export promise covers all of them. */
export function listAllCodes(db: Db, userId: string) {
  return db.select().from(codes).where(eq(codes.userId, userId)).orderBy(desc(codes.createdAt));
}

export async function countLiveCodes(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
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

const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    if ((current as Error & { code?: string }).code === UNIQUE_VIOLATION) return true;
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
  design: string | null;
  now: number;
}

/** Writes the code and its first destination together. Throws on a short-code collision. */
export async function insertCode(db: Db, code: NewCode): Promise<Code> {
  const { id, historyId, shortCode, userId, destination, label, design, now } = code;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(codes)
      .values({ id, shortCode, userId, destination, label, design, createdAt: now, updatedAt: now })
      .returning();
    if (!row) throw new Error("Insert returned no row");
    await tx
      .insert(codeDestinations)
      .values({ id: historyId, codeId: id, destination, createdAt: now });
    return row;
  });
}

type CodeChanges = Partial<Pick<Code, "destination" | "label" | "status" | "design">>;

/**
 * Applies a change, bumping `version` if it affects the KV record so that a failed
 * KV write is retried. `historyId` records a destination change in the same transaction.
 */
export async function updateCode(
  db: Db,
  code: Code,
  changes: CodeChanges,
  now: number,
  historyId: string | null,
): Promise<Code> {
  const affectsKv = changes.destination !== undefined || changes.status !== undefined;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(codes)
      .set({ ...changes, updatedAt: now, version: code.version + (affectsKv ? 1 : 0) })
      .where(eq(codes.id, code.id))
      .returning();
    if (!row) throw new Error("Update returned no row");
    if (historyId && changes.destination !== undefined) {
      await tx.insert(codeDestinations).values({
        id: historyId,
        codeId: code.id,
        destination: changes.destination,
        createdAt: now,
      });
    }
    return row;
  });
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
    .set({ syncedVersion: sql`greatest(${codes.syncedVersion}, ${version})` })
    .where(eq(codes.id, id));
}

export function listUnsyncedCodes(db: Db, limit: number) {
  return db.select().from(codes).where(lt(codes.syncedVersion, codes.version)).limit(limit);
}

export async function insertScans(db: Db, events: ScanEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db.insert(scans).values(events).onConflictDoNothing();
}

export interface ScanFilters {
  userId: string;
  since: number;
  codeId?: string;
  device?: "mobile" | "desktop" | "unknown";
  country?: string;
}

/**
 * Aggregates for one owner, scoped through `codes` so one account can never read
 * another's scans.
 */
export async function scanAnalytics(db: Db, filters: ScanFilters) {
  const { userId, since, codeId, device, country } = filters;
  const scoped = and(
    eq(codes.userId, userId),
    gte(scans.scannedAt, since),
    codeId ? eq(codes.id, codeId) : undefined,
    device ? eq(scans.deviceType, device) : undefined,
    country ? eq(scans.country, country) : undefined,
  );
  const count = sql<number>`count(*)::int`;
  const day = sql<string>`to_char(to_timestamp(${scans.scannedAt} / 1000.0) at time zone 'UTC', 'YYYY-MM-DD')`;

  const [totals, byDay, byDevice, byOs, byLocation, byCountry, byCode, recent] = await Promise.all([
    db
      .select({ scans: count, visitors: sql<number>`count(distinct ${scans.visitorHash})::int` })
      .from(scans)
      .innerJoin(codes, eq(scans.shortCode, codes.shortCode))
      .where(scoped),
    db
      .select({ day, scans: count })
      .from(scans)
      .innerJoin(codes, eq(scans.shortCode, codes.shortCode))
      .where(scoped)
      .groupBy(day)
      .orderBy(day),
    db
      .select({ key: scans.deviceType, scans: count })
      .from(scans)
      .innerJoin(codes, eq(scans.shortCode, codes.shortCode))
      .where(scoped)
      .groupBy(scans.deviceType)
      .orderBy(desc(count)),
    db
      .select({ key: scans.os, scans: count })
      .from(scans)
      .innerJoin(codes, eq(scans.shortCode, codes.shortCode))
      .where(scoped)
      .groupBy(scans.os)
      .orderBy(desc(count)),
    db
      .select({ city: scans.city, region: scans.region, country: scans.country, scans: count })
      .from(scans)
      .innerJoin(codes, eq(scans.shortCode, codes.shortCode))
      .where(scoped)
      .groupBy(scans.city, scans.region, scans.country)
      .orderBy(desc(count))
      .limit(10),
    db
      .select({ key: scans.country, scans: count })
      .from(scans)
      .innerJoin(codes, eq(scans.shortCode, codes.shortCode))
      .where(scoped)
      .groupBy(scans.country)
      .orderBy(desc(count))
      .limit(50),
    db
      .select({ id: codes.id, label: codes.label, shortCode: codes.shortCode, scans: count })
      .from(scans)
      .innerJoin(codes, eq(scans.shortCode, codes.shortCode))
      .where(scoped)
      .groupBy(codes.id)
      .orderBy(desc(count))
      .limit(20),
    db
      .select({
        scannedAt: scans.scannedAt,
        city: scans.city,
        region: scans.region,
        country: scans.country,
        deviceType: scans.deviceType,
        os: scans.os,
        label: codes.label,
        shortCode: codes.shortCode,
      })
      .from(scans)
      .innerJoin(codes, eq(scans.shortCode, codes.shortCode))
      .where(scoped)
      .orderBy(desc(scans.scannedAt))
      .limit(20),
  ]);
  return {
    totals: totals[0] ?? { scans: 0, visitors: 0 },
    byDay,
    byDevice,
    byOs,
    byLocation,
    byCountry,
    byCode,
    recent,
  };
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

export async function joinWaitlist(db: Db, entry: typeof schema.waitlist.$inferInsert) {
  await db.insert(schema.waitlist).values(entry).onConflictDoNothing();
}

export async function insertReport(
  db: Db,
  report: typeof schema.providerReports.$inferInsert,
): Promise<void> {
  await db.insert(schema.providerReports).values(report);
}
