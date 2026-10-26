import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = (f: string) => path.join(__dirname, "../fixtures/statements", f);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  // On a first visit the walkthrough dialog hides the page from the accessibility tree, so wait on the URL.
  await expect(page).toHaveURL(/\/$/);
}

test.describe.configure({ mode: "serial" });

test("protects pages and APIs without a session", async ({ page, request }) => {
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.post("/api/imports")).status()).toBe(401);
  expect((await request.get("/api/transactions/export")).status()).toBe(401);
  const res = await request.get("/login");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});

test("rejects a wrong password", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("nope-nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Incorrect password." })).toBeVisible();
});

// Runs first against the freshly truncated database, so this is a genuine first visit.
test("first run: walkthrough once, setup checklist, guiding empty states", async ({ page }) => {
  await login(page);
  const walkthrough = page.getByRole("dialog");
  await expect(walkthrough).toBeVisible();
  await expect(walkthrough.getByText("Step 1 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(walkthrough.getByText("Step 2 of 4")).toBeVisible();
  await expect(walkthrough.getByText(/Transfers between your own accounts, investments, cash withdrawals and lending/)).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(walkthrough.getByText("Step 1 of 4")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(walkthrough).toBeHidden();

  // Seen is stored on the server: it does not open again.
  await page.reload();
  await expect(page.getByText("0 of 4 required steps done.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/analysis");
  await expect(page.getByText("Add a bank account first")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Add account" })).toHaveAttribute("href", "/accounts");
  await page.getByRole("main").getByRole("link", { name: "See all setup steps" }).click();

  await expect(page.getByRole("heading", { name: "Guide" })).toBeVisible();
  for (const step of ["Add your bank accounts", "Import a statement for every account", "Tell Fintrack who you are", "Review flagged transactions", "Upload your Paytm history", "Set a budget or goal"]) {
    await expect(page.getByRole("listitem").filter({ hasText: step })).toHaveCount(1);
  }
  await page.getByRole("button", { name: "How Fintrack works" }).click();
  await expect(page.getByRole("dialog").getByText("Step 1 of 4")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("create an account, import a statement with preview, and see transactions", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Add your bank accounts")).toBeVisible();

  await page.goto("/accounts");
  // The empty state offers the same form as the header button.
  await page.getByRole("main").locator(".border-dashed").getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Kotak savings");
  await page.getByLabel("Bank", { exact: true }).fill("Kotak Mahindra Bank");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Kotak savings").first()).toBeVisible();

  await page.goto("/import");
  await page.locator("#file").setInputFiles(fixture("kotak-synthetic.pdf"));
  await page.getByRole("button", { name: /Upload & preview/ }).click();
  await expect(page.getByRole("heading", { name: "Review import" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Every row reconciles")).toBeVisible();
  await page.getByRole("button", { name: "Import 17 transaction(s)" }).click();
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/All time · 17 transaction\(s\)/)).toBeVisible();

  // Re-uploading the same file is detected and does not duplicate.
  await page.goto("/import");
  await page.locator("#file").setInputFiles(fixture("kotak-synthetic.pdf"));
  await page.getByRole("button", { name: /Upload & preview/ }).click();
  await expect(page.getByRole("heading", { name: "Import details" })).toBeVisible({ timeout: 30_000 });

  await page.goto("/transactions?range=all&q=netflix");
  await expect(page.getByText(/All time · 3 transaction\(s\)/)).toBeVisible();
});

test("rejects scanned PDFs with an OCR explanation", async ({ page }) => {
  await login(page);
  await page.goto("/import");
  await page.locator("#file").setInputFiles(fixture("scanned-image.pdf"));
  await page.getByRole("button", { name: /Upload & preview/ }).click();
  await expect(page.getByText(/OCR is required/)).toBeVisible({ timeout: 30_000 });
});

test("dashboard and analysis show real totals", async ({ page }) => {
  await login(page);
  await page.goto("/?range=custom&from=2026-01-01&to=2026-03-31");
  await expect(page.getByText("₹2,55,000")).toBeVisible(); // 3 × ₹85,000 salary
  await page.goto("/analysis?range=custom&from=2026-01-01&to=2026-03-31");
  await expect(page.getByRole("heading", { name: "Where is my money going?" })).toBeVisible();
  await expect(page.getByText("Rent and housing").first()).toBeVisible();
});
