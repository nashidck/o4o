import "dotenv/config";
import pg from "pg";
const url = new URL(process.env.DATABASE_URL!);
url.pathname = "/postgres";
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname='o4o_utf8'",
);
if (!result.rowCount)
  await client.query(
    "CREATE DATABASE o4o_utf8 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0",
  );
await client.end();
console.log("UTF8 application database ready");
