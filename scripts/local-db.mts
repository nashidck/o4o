import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const databaseDir = resolve(".local/postgres");
const port = Number(process.env.LOCAL_DB_PORT || 55432);
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "o4o",
  password: "local-development-only",
  port,
  persistent: true,
  autoRehydrateSymlinks: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: console.log,
  onError: (error) => console.error(String(error)),
});
if (!existsSync(resolve(databaseDir, "PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient("postgres");
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname='o4o_utf8'",
);
if (!result.rowCount)
  await client.query(
    "CREATE DATABASE o4o_utf8 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0",
  );
await client.end();
console.log(
  `Local PostgreSQL ready on 127.0.0.1:${port} (workspace data in .local/postgres)`,
);
const keepAlive = setInterval(() => {}, 60000);
async function stop() {
  clearInterval(keepAlive);
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
