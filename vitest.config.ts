import { defineConfig } from "vitest/config";
import path from "node:path";

// Pick up TEST_DATABASE_URL from .env when present (tests never use DATABASE_URL).
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
    globalSetup: ["tests/integration/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/fintrack_test?schema=public`,
      SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
    },
  },
});
