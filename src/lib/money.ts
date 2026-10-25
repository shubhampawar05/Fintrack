/**
 * Money is represented as integer paise (1 INR = 100 paise) everywhere in the app.
 * The database stores BigInt; in application code we use JS numbers that are
 * asserted to be safe integers (exact up to ~₹90 trillion). Never use floats for money.
 */

export type Paise = number;

export function assertPaise(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid paise value: ${value}`);
  }
  return value;
}

export function toPaise(value: bigint | number | null | undefined): Paise {
  if (value === null || value === undefined) return 0;
  return assertPaise(typeof value === "bigint" ? Number(value) : value);
}

export function sumPaise(values: Iterable<Paise>): Paise {
  let total = 0;
  for (const v of values) total += v;
  return assertPaise(total);
}

const AMOUNT_RE = /^(?<neg>[-(])?\s*(?:₹|rs\.?|inr)?\s*(?<int>\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(?<dec>\d{1,2}))?\s*\)?\s*(?<drcr>cr|dr)?\.?$/i;

/**
 * Parse an Indian-formatted amount string into paise using string arithmetic only.
 * Accepts "1,23,456.78", "1234.5", "₹ 500", "(1,000.00)", "-200", "500.00 Dr".
 * Returns null for blanks and placeholders ("-", "", "NA").
 * The sign is only negative for explicit "-", "(...)" or a "Dr" suffix.
 */
export function parseAmountToPaise(input: string | number | null | undefined): Paise | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    // Spreadsheet cells come in as numbers; round via string to avoid FP artefacts.
    return parseAmountToPaise(input.toFixed(2));
  }
  const s = input.replace(/ /g, " ").trim();
  if (s === "" || s === "-" || s === "--" || /^n\/?a$/i.test(s)) return null;
  const m = AMOUNT_RE.exec(s);
  if (!m?.groups) return null;
  const intPart = m.groups.int.replace(/,/g, "");
  const dec = (m.groups.dec ?? "").padEnd(2, "0");
  const paise = Number(intPart) * 100 + Number(dec);
  if (!Number.isSafeInteger(paise)) return null;
  const negative = Boolean(m.groups.neg) || m.groups.drcr?.toLowerCase() === "dr";
  return negative ? -paise : paise;
}

export function isAmountToken(s: string): boolean {
  return /^-?(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}$/.test(s.trim());
}

const groupFormatter = new Intl.NumberFormat("en-IN");

/** Format paise as Indian rupees, e.g. 12345678 -> "₹1,23,456.78". */
export function formatINR(
  paise: Paise,
  opts: { decimals?: boolean; sign?: boolean; compact?: boolean } = {},
): string {
  const { decimals = true, sign = false, compact = false } = opts;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  let body: string;
  const CRORE = 1_00_00_000_00; // ₹1 crore in paise
  const LAKH = 1_00_000_00; // ₹1 lakh in paise
  if (compact && abs >= CRORE) {
    body = `${trimZero(abs / CRORE)}Cr`;
  } else if (compact && abs >= LAKH) {
    body = `${trimZero(abs / LAKH)}L`;
  } else if (compact && abs >= 1_000_00) {
    body = `${trimZero(abs / 1_000_00)}K`;
  } else {
    const rupees = Math.trunc(abs / 100);
    const p = abs % 100;
    body = groupFormatter.format(rupees);
    if (decimals) body += `.${String(p).padStart(2, "0")}`;
    else if (p >= 50) body = groupFormatter.format(rupees + 1);
  }
  const prefix = negative ? "-" : sign && paise > 0 ? "+" : "";
  return `${prefix}₹${body}`;
}

function trimZero(n: number): string {
  // Display-only rounding for compact chart labels.
  return n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, "");
}

/** Percentage with one decimal, computed from integers. Returns null when denominator is 0. */
export function percent(numerator: Paise, denominator: Paise): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator * 1000) / denominator) / 10;
}

/** Convert a user-entered rupee string to paise (for forms). */
export function rupeesInputToPaise(value: string): Paise | null {
  const p = parseAmountToPaise(value);
  return p === null ? null : p;
}

export function paiseToRupeeInput(paise: Paise): string {
  const neg = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${neg}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
