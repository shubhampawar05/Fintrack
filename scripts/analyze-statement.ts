/**
 * Local CLI to check how a statement parses, without touching the database.
 * Prints only aggregate information (no transaction descriptions).
 *   npx tsx scripts/analyze-statement.ts <file> [password]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStatement } from "../src/lib/parsing";
import { formatINR, sumPaise } from "../src/lib/money";

async function main() {
  const [file, password] = process.argv.slice(2);
  if (!file) throw new Error("Usage: tsx scripts/analyze-statement.ts <file> [password]");
  const bytes = new Uint8Array(readFileSync(file));
  const r = await parseStatement({ bytes, fileName: basename(file), password });
  const ok = r.rows.filter((x) => x.errors.length === 0);
  const debit = sumPaise(ok.filter((x) => x.direction === "DEBIT").map((x) => x.amountPaise!));
  const credit = sumPaise(ok.filter((x) => x.direction === "CREDIT").map((x) => x.amountPaise!));
  console.log(JSON.stringify({
    parser: `${r.parserId}@${r.parserVersion}`,
    bank: r.meta.bankName,
    account: r.meta.accountNumber ? `XX${r.meta.accountNumber.slice(-4)}` : undefined,
    period: `${r.meta.periodStart} → ${r.meta.periodEnd}`,
    rows: r.rows.length,
    rowsWithErrors: r.rows.length - ok.length,
    rowsWithWarnings: r.rows.filter((x) => x.warnings.length).length,
    opening: r.meta.openingBalancePaise != null ? formatINR(r.meta.openingBalancePaise) : null,
    closing: r.meta.closingBalancePaise != null ? formatINR(r.meta.closingBalancePaise) : null,
    debits: formatINR(debit),
    credits: formatINR(credit),
    balanceCheck: r.balanceCheck,
    warnings: r.warnings,
    errors: r.errors,
  }, null, 2));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
