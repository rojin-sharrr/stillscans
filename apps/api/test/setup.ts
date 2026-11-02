import { vi } from "vitest";
import { testDb } from "./test-db";

vi.mock("@stillscans/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@stillscans/db")>()),
  createDb: () => ({ db: testDb.current, close: async () => {} }),
}));
