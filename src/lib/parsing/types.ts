import type { Paise } from "@/lib/money";

export type Direction = "DEBIT" | "CREDIT";

/** One normalized row extracted from a statement, before it becomes a Transaction. */
export interface ParsedRow {
  rowIndex: number;
  page?: number;
  txnDate: string | null; // ISO date
  valueDate?: string | null;
  description: string;
  reference?: string | null;
  amountPaise: Paise | null; // always positive
  direction: Direction | null;
  balancePaise?: Paise | null; // running balance after this row, signed
  /** Original cell text exactly as extracted, preserved for audit. */
  raw: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export interface StatementMeta {
  bankName?: string;
  accountNumber?: string;
  holderName?: string;
  holderMobile?: string;
  ifsc?: string;
  periodStart?: string;
  periodEnd?: string;
  statementDate?: string;
  openingBalancePaise?: Paise;
  closingBalancePaise?: Paise;
  /** Totals printed by the bank, used to cross-check extraction. */
  reportedDebitTotalPaise?: Paise;
  reportedCreditTotalPaise?: Paise;
  reportedCount?: number;
}

export type BalanceCheckStatus = "PASSED" | "FAILED" | "NOT_AVAILABLE";

export interface ParseResult {
  parserId: string;
  parserVersion: string;
  fileType: "PDF" | "CSV" | "XLSX";
  meta: StatementMeta;
  rows: ParsedRow[];
  warnings: string[];
  /** Fatal problems; when non-empty the statement cannot be imported as-is. */
  errors: string[];
  needsOcr?: boolean;
  needsPassword?: boolean;
  balanceCheck: { status: BalanceCheckStatus; checked: number; mismatches: number[] };
  /** For CSV/XLSX: the raw grid and the column mapping used, so the user can remap. */
  table?: { headerRowIndex: number; headers: string[]; rows: string[][] };
  mapping?: ColumnMapping;
}

export interface ColumnMapping {
  date: number | null;
  valueDate?: number | null;
  description: number | null;
  reference?: number | null;
  debit?: number | null;
  credit?: number | null;
  /** Single signed amount column (used when no separate debit/credit columns). */
  amount?: number | null;
  /** Column holding "Dr"/"Cr" markers for a single amount column. */
  drCr?: number | null;
  balance?: number | null;
  /** For a single `amount` column without a Dr/Cr column: are debits negative? */
  negativeIsDebit?: boolean;
}

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly code: "PASSWORD_REQUIRED" | "PASSWORD_INCORRECT" | "NEEDS_OCR" | "UNSUPPORTED" | "INVALID_FILE",
  ) {
    super(message);
  }
}
