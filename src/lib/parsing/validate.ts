import { formatINR, sumPaise } from "@/lib/money";
import type { Direction, ParseResult, ParsedRow, StatementMeta } from "./types";

/** Per-row field validation. Mutates row.errors. */
export function validateRow(row: ParsedRow): void {
  if (!row.txnDate) row.errors.push("Missing or invalid transaction date");
  if (!row.description.trim()) row.errors.push("Missing description");
  if (row.amountPaise === null) row.errors.push("Missing or invalid amount");
  else if (row.amountPaise <= 0) row.errors.push("Amount must be greater than zero");
  if (!row.direction) row.errors.push("Could not determine debit or credit");
}

interface ChainOutcome {
  checked: number;
  mismatches: number[];
  corrections: Map<number, Direction>;
}

function walkChain(rows: ParsedRow[], opening: number | undefined): ChainOutcome {
  let prev: number | null = opening ?? null;
  let checked = 0;
  const mismatches: number[] = [];
  const corrections = new Map<number, Direction>();
  for (const row of rows) {
    if (row.balancePaise === null || row.balancePaise === undefined) {
      prev = null;
      continue;
    }
    if (prev !== null && row.amountPaise !== null && row.amountPaise > 0) {
      const delta = row.balancePaise - prev;
      if (Math.abs(delta) === row.amountPaise) {
        checked++;
        corrections.set(row.rowIndex, delta < 0 ? "DEBIT" : "CREDIT");
      } else {
        mismatches.push(row.rowIndex);
      }
    }
    prev = row.balancePaise;
  }
  return { checked, mismatches, corrections };
}

/**
 * Validate rows and verify them against the running balance printed on the statement.
 * The running balance is the strongest correctness signal we have: when the delta between
 * consecutive balances equals the row amount, the debit/credit direction is certain.
 */
export function finalizeRows(
  base: Omit<ParseResult, "balanceCheck" | "rows"> & { rows: ParsedRow[] },
): ParseResult {
  let rows = base.rows;
  const warnings = [...base.warnings];
  const meta: StatementMeta = { ...base.meta };

  let outcome = walkChain(rows, meta.openingBalancePaise);
  const checkable = outcome.checked + outcome.mismatches.length;
  if (checkable > 2 && outcome.mismatches.length > checkable / 2) {
    const reversed = [...rows].reverse();
    const alt = walkChain(reversed, meta.openingBalancePaise);
    if (alt.mismatches.length < outcome.mismatches.length) {
      rows = reversed.map((r, i) => ({ ...r, rowIndex: i }));
      outcome = walkChain(rows, meta.openingBalancePaise);
      warnings.push("Statement rows appear to be listed newest-first; they were reordered chronologically.");
    }
  }

  for (const row of rows) {
    const resolved = outcome.corrections.get(row.rowIndex);
    if (resolved && row.direction && resolved !== row.direction) {
      row.warnings.push(`Direction corrected from ${row.direction} to ${resolved} using the running balance`);
    }
    if (resolved) row.direction = resolved;
    if (outcome.mismatches.includes(row.rowIndex)) {
      row.warnings.push("Running balance does not reconcile with this row's amount — please verify");
    }
    validateRow(row);
    if (row.txnDate && meta.periodStart && meta.periodEnd && (row.txnDate < meta.periodStart || row.txnDate > meta.periodEnd)) {
      row.warnings.push("Date falls outside the statement period");
    }
  }

  // Derive opening balance from the first row when the statement does not print it.
  const first = rows.find((r) => r.balancePaise != null && r.amountPaise != null && r.direction);
  if (meta.openingBalancePaise === undefined && first && first === rows[0]) {
    meta.openingBalancePaise =
      first.balancePaise! + (first.direction === "DEBIT" ? first.amountPaise! : -first.amountPaise!);
  }
  const last = [...rows].reverse().find((r) => r.balancePaise != null);
  if (last && meta.closingBalancePaise === undefined) meta.closingBalancePaise = last.balancePaise!;
  if (last && meta.closingBalancePaise !== undefined && last.balancePaise !== meta.closingBalancePaise) {
    warnings.push(
      `Closing balance on the statement (${formatINR(meta.closingBalancePaise)}) differs from the last row's balance (${formatINR(last.balancePaise!)}).`,
    );
  }

  const valid = rows.filter((r) => r.errors.length === 0);
  if (meta.reportedDebitTotalPaise !== undefined) {
    const debit = sumPaise(valid.filter((r) => r.direction === "DEBIT").map((r) => r.amountPaise!));
    if (debit !== meta.reportedDebitTotalPaise) {
      warnings.push(`Extracted debits total ${formatINR(debit)} but the bank reports ${formatINR(meta.reportedDebitTotalPaise)}.`);
    }
  }
  if (meta.reportedCreditTotalPaise !== undefined) {
    const credit = sumPaise(valid.filter((r) => r.direction === "CREDIT").map((r) => r.amountPaise!));
    if (credit !== meta.reportedCreditTotalPaise) {
      warnings.push(`Extracted credits total ${formatINR(credit)} but the bank reports ${formatINR(meta.reportedCreditTotalPaise)}.`);
    }
  }
  if (meta.reportedCount !== undefined && meta.reportedCount !== rows.length) {
    warnings.push(`Extracted ${rows.length} rows but the bank reports ${meta.reportedCount} transactions.`);
  }

  const status = outcome.mismatches.length > 0 ? "FAILED" : outcome.checked > 0 ? "PASSED" : "NOT_AVAILABLE";
  if (status === "FAILED") {
    warnings.push(
      `${outcome.mismatches.length} row(s) do not reconcile with the running balance. Review highlighted rows before importing.`,
    );
  }
  if (rows.length === 0 && base.errors.length === 0) {
    base.errors.push("No transactions were found in this statement.");
  }

  return {
    ...base,
    meta,
    rows,
    warnings,
    balanceCheck: { status, checked: outcome.checked, mismatches: outcome.mismatches },
  };
}
