import { defineConfig } from "drizzle-kit";

// Migrations use the direct connection: poolers can't hold the session state they need.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
});
