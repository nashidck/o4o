import "dotenv/config";
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "database/schema.prisma",
  migrations: {
    path: "database/migrations",
    seed: "tsx --env-file=.env database/seed.ts",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://o4o:local-development-only@localhost:5432/o4o",
  },
});
