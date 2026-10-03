import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // prisma generate does not require a live database connection. Keep the
    // config build-safe; runtime database access is enforced in src/lib/db.ts.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
