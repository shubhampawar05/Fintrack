import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {}

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/fintrack_test?schema=public`;
  if (!/test/.test(url)) throw new Error("Refusing to run E2E tests against a non-test database.");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
  const prisma = new PrismaClient({ datasourceUrl: url });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  await prisma.$disconnect();
}
