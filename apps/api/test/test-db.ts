import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { type Db, schema } from "@stillscans/db";
import { drizzle } from "drizzle-orm/pglite";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../../packages/db/migrations");

/** The database `createDb` hands out during tests. See test/setup.ts. */
export const testDb: { current: Db | null } = { current: null };

/** Real Postgres, in memory, with the real migrations. Tests need no network or container. */
export async function startTestDatabase() {
  const client = new PGlite();
  const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));
  for (const file of files.sort()) {
    await client.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  const db = drizzle(client, { schema }) as unknown as Db;
  testDb.current = db;
  return { client, db };
}

interface Statement {
  bind(...values: unknown[]): Statement;
  first(): Promise<Record<string, unknown> | null>;
  all(): Promise<{ results: Record<string, unknown>[] }>;
  run(): Promise<void>;
}

/** A small SQL helper for test setup and assertions. `?` placeholders become `$1`, `$2`. */
export function sqlHelper(client: PGlite) {
  const prepare = (query: string, values: unknown[] = []): Statement => {
    let index = 0;
    const text = query.replace(/\?/g, () => `$${++index}`);
    const execute = () => client.query<Record<string, unknown>>(text, values);
    return {
      bind: (...next) => prepare(query, next),
      first: async () => (await execute()).rows[0] ?? null,
      all: async () => ({ results: (await execute()).rows }),
      run: async () => {
        await execute();
      },
    };
  };
  return {
    prepare,
    batch: async (statements: Statement[]) => {
      for (const statement of statements) await statement.run();
    },
  };
}
