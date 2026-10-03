import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const sql = await readFile(new URL("../prisma/postgis-v04.sql", import.meta.url), "utf8");
const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  process.stdout.write("FarmHQ PostGIS v0.4 spatial upgrade applied successfully.\n");
} catch (error) {
  try { await client.query("ROLLBACK"); } catch { /* best-effort rollback */ }
  throw error;
} finally {
  await client.end();
}
