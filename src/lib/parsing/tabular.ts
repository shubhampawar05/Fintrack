import { parseAmountToPaise } from "@/lib/money";
import { parseIndianDate } from "@/lib/dates";
import type { ColumnMapping, Direction, ParsedRow } from "./types";

const HEADER_PATTERNS: Record<keyof Omit<ColumnMapping, "negativeIsDebit">, RegExp> = {
  date: /^(txn\.?\s*|tran(saction)?\.?\s*|post(ing)?\s*)?date$|^date$/i,
  valueDate: /^value\s*(dt|date)$/i,
  description: /description|particulars|narration|details|remarks/i,
  reference: /chq|cheque|ref(erence)?(\s*no\.?)?|utr|tran(saction)?\s*id/i,
  debit: /withdrawal|debit|^dr\.?$|paid\s*out/i,
  credit: /deposit|credit|^cr\.?$|paid\s*in/i,
  amount: /^(txn\s*|transaction\s*)?amount(\s*\(inr\))?$|^amt$/i,
  drCr: /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|debit\s*\/\s*credit)$/i,
  balance: /balance/i,
};

/** Find the most header-like row in the first rows of a grid. */
export function detectHeaderRow(grid: string[][]): number {
  let best = -1;
  let bestScore = 0;
  for (let r = 0; r < Math.min(grid.length, 60); r++) {
    const cells = grid[r].map((c) => c.trim());
    let score = 0;
    const hasDate = cells.some((c) => HEADER_PATTERNS.date.test(c));
    for (const key of ["description", "debit", "credit", "amount", "balance"] as const) {
      if (cells.some((c) => HEADER_PATTERNS[key].test(c))) score++;
    }
    if (hasDate && score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : -1;
}

export function autoMap(headers: string[]): ColumnMapping {
  const h = headers.map((c) => c.trim());
  const used = new Set<number>();
  const pick = (re: RegExp, skip?: RegExp) => {
    const i = h.findIndex((c, idx) => !used.has(idx) && re.test(c) && !(skip && skip.test(c)));
    if (i >= 0) used.add(i);
    return i >= 0 ? i : null;
  };
  // Order matters: specific headings before generic ones.
  const valueDate = pick(HEADER_PATTERNS.valueDate);
  const date = pick(HEADER_PATTERNS.date);
  const balance = pick(HEADER_PATTERNS.balance);
  const debit = pick(HEADER_PATTERNS.debit, /credit/i);
  const credit = pick(HEADER_PATTERNS.credit);
  const amount = debit === null && credit === null ? pick(HEADER_PATTERNS.amount) : null;
  const drCr = amount !== null ? pick(HEADER_PATTERNS.drCr) : null;
  const description = pick(HEADER_PATTERNS.description);
  const reference = pick(HEADER_PATTERNS.reference);
  return { date, valueDate, description, reference, debit, credit, amount, drCr, balance, negativeIsDebit: true };
}

function cell(row: string[], idx: number | null | undefined): string {
  return idx === null || idx === undefined ? "" : (row[idx] ?? "").toString().trim();
}

export function mappingErrors(m: ColumnMapping): string[] {
  const errs: string[] = [];
  if (m.date === null) errs.push("Map a column to the transaction date.");
  if (m.description === null) errs.push("Map a column to the description.");
  const hasSplit = m.debit != null || m.credit != null;
  if (!hasSplit && m.amount == null) errs.push("Map debit/credit columns or a single amount column.");
  return errs;
}

/** Turn a grid + mapping into normalized rows. Wrapped narration rows are merged upward. */
export function rowsFromGrid(grid: string[][], headerRowIndex: number, m: ColumnMapping): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const line = grid[r];
    if (line.every((c) => !String(c ?? "").trim())) continue;
    const dateText = cell(line, m.date);
    const desc = cell(line, m.description);
    const debitText = cell(line, m.debit);
    const creditText = cell(line, m.credit);
    const amountText = cell(line, m.amount);
    const txnDate = parseIndianDate(dateText);
    const hasAmount = [debitText, creditText, amountText].some((t) => parseAmountToPaise(t));

    if (!txnDate && !hasAmount) {
      // Continuation of the previous narration, or a footer/summary line.
      if (desc && rows.length && !dateText) {
        const prev = rows[rows.length - 1];
        prev.description = `${prev.description} ${desc}`.trim();
        prev.raw.description = prev.description;
      }
      continue;
    }

    const raw: Record<string, string> = {};
    line.forEach((v, i) => (raw[`col${i}`] = String(v ?? "")));
    const errors: string[] = [];
    let amountPaise: number | null = null;
    let direction: Direction | null = null;
    const debit = parseAmountToPaise(debitText);
    const credit = parseAmountToPaise(creditText);
    if (m.debit != null || m.credit != null) {
      if (debit && credit) errors.push("Row has both a debit and a credit amount");
      else if (debit) {
        amountPaise = Math.abs(debit);
        direction = "DEBIT";
      } else if (credit) {
        amountPaise = Math.abs(credit);
        direction = "CREDIT";
      }
    } else {
      const amt = parseAmountToPaise(amountText);
      const marker = cell(line, m.drCr).toLowerCase();
      if (amt !== null && amt !== 0) {
        amountPaise = Math.abs(amt);
        if (/^(dr|debit|d|withdrawal)/.test(marker)) direction = "DEBIT";
        else if (/^(cr|credit|c|deposit)/.test(marker)) direction = "CREDIT";
        else if (/dr\.?$/i.test(amountText)) direction = "DEBIT";
        else if (/cr\.?$/i.test(amountText)) direction = "CREDIT";
        else direction = (amt < 0) === (m.negativeIsDebit ?? true) ? "DEBIT" : "CREDIT";
      }
    }
    const balText = cell(line, m.balance);
    rows.push({
      rowIndex: rows.length,
      txnDate,
      valueDate: parseIndianDate(cell(line, m.valueDate)),
      description: desc,
      reference: cell(line, m.reference) || null,
      amountPaise,
      direction,
      balancePaise: balText ? parseAmountToPaise(balText) : null,
      raw,
      errors,
      warnings: [],
    });
  }
  return rows;
}
