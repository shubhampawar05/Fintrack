/**
 * DEVELOPMENT ONLY. Creates the owner user with built-in categories and rules.
 *   npm run db:seed            → owner + defaults
 *   npm run db:seed -- --demo  → also imports the SYNTHETIC fixture statements into demo accounts
 * Never seeds real financial data.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/server/db";
import { ensureUserDefaults } from "../src/server/bootstrap";
import { commitImport, createPreview } from "../src/server/imports";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production.");
  const email = process.env.APP_USER_EMAIL || "owner@fintrack.local";
  const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name: process.env.APP_USER_NAME || "Owner" } });
  await ensureUserDefaults(user.id);
  console.log(`Owner ready (${email}).`);

  if (process.argv.includes("--demo")) {
    const dir = path.join(__dirname, "../tests/fixtures/statements");
    const demo: [string, string, string][] = [
      ["Demo Kotak", "Kotak Mahindra Bank", "kotak-synthetic.pdf"],
      ["Demo Federal", "Federal Bank", "federal-synthetic.pdf"],
      ["Demo BoM", "Bank of Maharashtra", "bom-synthetic.pdf"],
    ];
    for (const [displayName, bankName, file] of demo) {
      const a = await prisma.bankAccount.upsert({ where: { userId_displayName: { userId: user.id, displayName } }, update: {}, create: { userId: user.id, displayName, bankName } });
      const p = await createPreview({ userId: user.id, accountId: a.id, fileName: file, bytes: new Uint8Array(readFileSync(path.join(dir, file))) });
      if (p.ok) console.log(displayName, await commitImport(user.id, p.importId));
      else console.log(displayName, p.message);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
