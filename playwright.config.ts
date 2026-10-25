import { defineConfig } from "@playwright/test";

// Pick up TEST_DATABASE_URL from .env when present (tests never use DATABASE_URL).
try {
  process.loadEnvFile();
} catch {}

const TEST_DB = process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/fintrack_test?schema=public`;
const PORT = 3200;

/** E2E tests run the production build against the dedicated test database with synthetic data. */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: TEST_DB,
      APP_PASSWORD: "e2e-password-123",
      SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-123456",
      APP_USER_EMAIL: "e2e@fintrack.local",
    },
  },
});
