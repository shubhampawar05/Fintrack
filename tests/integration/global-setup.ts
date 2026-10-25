import { execSync } from "node:child_process";

/** Apply migrations to the dedicated test database (never the development database). */
try {
  process.loadEnvFile();
} catch {}

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/fintrack_test?schema=public`;
  if (!/test/.test(url)) throw new Error("Refusing to run integration tests against a non-test database.");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
}
