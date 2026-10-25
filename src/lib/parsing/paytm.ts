import { parseAmountToPaise, type Paise } from "@/lib/money";
import type { PdfDocumentText, PdfLine } from "./pdf/extract";

/**
 * Paytm "UPI Statement" (Passbook Payments History). It is not a bank statement: there are no
 * balances, and every payment also appears in the paying bank account. Its value is what the bank
 * narration lacks — the payee's real name, your note and your tags — matched by UPI reference.
 */
export const PAYTM_PARSER = { id: "paytm-upi-pdf", version: "1.0.0" };

export type PaytmKind = "PAID" | "RECEIVED" | "SELF";

export interface PaytmEntry {
  date: string; // ISO
  time?: string;
  kind: PaytmKind;
  amountPaise: Paise;
  /** "Paid to X" / "Money sent to X" / "Received from X"; for self transfers the destination account. */
  payee: string;
  upiId?: string;
  upiRef?: string;
  bankRef?: string;
  note?: string;
  tags: string[];
  /** The Paytm-side account label, e.g. "Fi (Federal Bank) - 96" or "CSB Bank Rupay Credit Card - 55". */
  account: string;
  page: number;
}

export interface PaytmSummary {
  holderName?: string;
  periodStart?: string;
  periodEnd?: string;
  reportedPaidPaise?: Paise;
  reportedReceivedPaise?: Paise;
  reportedPaidCount?: number;
  reportedReceivedCount?: number;
}

export interface PaytmParseResult {
  summary: PaytmSummary;
  entries: PaytmEntry[];
  /** Entries whose amount or date could not be read. */
  skipped: number;
  /** Paid/received totals recomputed from the entries agree with Paytm's printed totals. */
  totalsCheck: "PASSED" | "FAILED" | "NOT_AVAILABLE";
  warnings: string[];
}

// Column left edges in the Paytm layout (pt). Only the boundaries matter.
const DETAILS_X = 80;
const NOTES_X = 280;
const ACCOUNT_X = 395;
const AMOUNT_X = 480;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const ANCHOR_DATE = /^(\d{1,2}) ([A-Za-z]{3})$/;
const AMOUNT = /^([-+])?\s*Rs\.?\s*([\d,]+(?:\.\d{1,2})?)$/;
const PAGE_CHROME = /^(Passbook Payments History|All payments done by you|Date &|Time|Transaction Details|Page|For any queries|Contact Us)/;

export function isPaytmStatement(doc: PdfDocumentText): boolean {
  return /Paytm Statement for/.test(doc.fullText) && /Passbook Payments History/.test(doc.fullText);
}

function isoFromHeader(day: string, mon: string, yy: string): string | undefined {
  const m = MONTHS.indexOf(mon.toUpperCase());
  if (m < 0) return undefined;
  return `20${yy}-${String(m + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function summaryFrom(doc: PdfDocumentText): PaytmSummary {
  const t = doc.fullText;
  const period = /(\d{1,2}) ([A-Z]{3})'(\d{2}) - (\d{1,2}) ([A-Z]{3})'(\d{2})/.exec(t);
  const paid = /- Rs\.([\d,]+(?:\.\d+)?)\s+\+ Rs\.([\d,]+(?:\.\d+)?)/.exec(t);
  const counts = /(\d+) Payments? made\s+(\d+) Payments? received/.exec(t);
  return {
    holderName: doc.lines.find((l) => l.page === 1)?.text.trim(),
    periodStart: period ? isoFromHeader(period[1], period[2], period[3]) : undefined,
    periodEnd: period ? isoFromHeader(period[4], period[5], period[6]) : undefined,
    reportedPaidPaise: paid ? (parseAmountToPaise(paid[1]) ?? undefined) : undefined,
    reportedReceivedPaise: paid ? (parseAmountToPaise(paid[2]) ?? undefined) : undefined,
    reportedPaidCount: counts ? Number(counts[1]) : undefined,
    reportedReceivedCount: counts ? Number(counts[2]) : undefined,
  };
}

/** Entries carry only "25 Oct"; the year follows from the statement period (at most 12 months). */
function resolveYear(day: string, mon: string, periodEnd: string | undefined): string | null {
  const m = MONTHS.indexOf(mon.toUpperCase());
  if (m < 0 || !periodEnd) return null;
  const endYear = Number(periodEnd.slice(0, 4));
  const md = `${String(m + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  const year = md <= periodEnd.slice(5) ? endYear : endYear - 1;
  return `${year}-${md}`;
}

interface Cell {
  y: number;
  page: number;
  x: number;
  str: string;
}

function column(cells: Cell[], from: number, to: number): string[] {
  return cells.filter((c) => c.x >= from && c.x < to).map((c) => c.str.trim()).filter(Boolean);
}

function parseEntry(anchor: PdfLine, body: PdfLine[], periodEnd: string | undefined): PaytmEntry | null {
  // Reading order inside the card: top to bottom, then left to right.
  const cells: Cell[] = [anchor, ...body]
    .flatMap((l) => l.items.map((i) => ({ y: l.y, page: l.page, x: i.x, str: i.str })))
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const dateCell = anchor.items.find((i) => i.x < DETAILS_X && ANCHOR_DATE.test(i.str.trim()));
  const amountCell = anchor.items.find((i) => i.x >= AMOUNT_X && AMOUNT.test(i.str.trim()));
  if (!dateCell || !amountCell) return null;
  const [, day, mon] = ANCHOR_DATE.exec(dateCell.str.trim())!;
  const date = resolveYear(day, mon, periodEnd);
  const [, sign, amt] = AMOUNT.exec(amountCell.str.trim())!;
  const amountPaise = parseAmountToPaise(amt);
  if (!date || amountPaise === null) return null;

  const time = column(cells, 0, DETAILS_X).find((s) => /^\d{1,2}:\d{2} [AP]M$/.test(s));

  // Details column: "<lead> <name…>", "UPI ID: <vpa…> on", "UPI Ref No: n", "Bank Ref No: n", "Order ID: n".
  let section: "name" | "upi" | "other" = "name";
  const name: string[] = [];
  const upi: string[] = [];
  let upiRef: string | undefined;
  let bankRef: string | undefined;
  for (const s of column(cells, DETAILS_X, NOTES_X)) {
    let m: RegExpExecArray | null;
    if ((m = /^UPI ID:\s*(.*)$/.exec(s))) {
      section = "upi";
      upi.push(m[1]);
    } else if ((m = /^UPI Ref No:\s*(\d+)/.exec(s))) {
      section = "other";
      upiRef = m[1];
    } else if ((m = /^Bank Ref No:\s*(\d+)/.exec(s))) {
      section = "other";
      bankRef = m[1];
    } else if (/^Order ID:/.test(s)) {
      section = "other";
    } else if (section === "name") name.push(s);
    else if (section === "upi") upi.push(s);
  }
  const lead = name.join(" ").replace(/\s+/g, " ").trim();
  let kind: PaytmKind = sign === "+" ? "RECEIVED" : "PAID";
  let payee = lead.replace(/^(Paid to|Money sent to|Received from)\s+/i, "");
  if (!sign && /^Transferred to Self/i.test(lead)) {
    kind = "SELF";
    payee = lead.replace(/^Transferred to Self,?\s*/i, "");
  }
  const upiId = upi.join("").replace(/\s*on$/, "").trim() || undefined;

  // Notes & Tags column: "Note: <text…>" then "Tag:" then "#tag" lines.
  const noteParts: string[] = [];
  const tagParts: string[] = [];
  let inTags = false;
  for (const s of column(cells, NOTES_X, ACCOUNT_X)) {
    if (/^Tag:/.test(s)) {
      inTags = true;
      const rest = s.replace(/^Tag:\s*/, "");
      if (rest) tagParts.push(rest);
    } else if (inTags) tagParts.push(s);
    else noteParts.push(s.replace(/^Note:\s*/, ""));
  }
  const note = noteParts.join(" ").replace(/\s+/g, " ").trim() || undefined;
  const tags = tagParts
    .join(" ")
    .split(/(?=#)/)
    .map((t) => t.replace(/^#\s*/, "").replace(/\p{Extended_Pictographic}|️/gu, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const account = column(cells, ACCOUNT_X, AMOUNT_X).join(" ").replace(/\s+/g, " ").replace(/- (\d+)$/, "- $1").trim();

  return {
    date,
    time,
    kind,
    amountPaise,
    payee,
    upiId,
    upiRef,
    bankRef,
    note,
    tags,
    account,
    page: anchor.page,
  };
}

export function parsePaytmStatement(doc: PdfDocumentText): PaytmParseResult {
  const summary = summaryFrom(doc);
  const warnings: string[] = [];
  // Entries start on a line with a short date in the first column and an amount in the last.
  const isAnchor = (l: PdfLine) =>
    l.items.some((i) => i.x < DETAILS_X && ANCHOR_DATE.test(i.str.trim())) &&
    l.items.some((i) => i.x >= AMOUNT_X && AMOUNT.test(i.str.trim()));
  const firstEntryPage = doc.lines.find(isAnchor)?.page ?? Infinity;

  const groups: { anchor: PdfLine; body: PdfLine[] }[] = [];
  for (const line of doc.lines) {
    if (line.page < firstEntryPage && !isAnchor(line)) continue;
    if (isAnchor(line)) {
      groups.push({ anchor: line, body: [] });
      continue;
    }
    if (PAGE_CHROME.test(line.text.trim())) continue;
    // Per-entry footnotes ("Note: This payment is not included…") sit at the left margin.
    if (line.items[0].x < 20) continue;
    groups[groups.length - 1]?.body.push(line);
  }

  const entries: PaytmEntry[] = [];
  let skipped = 0;
  for (const g of groups) {
    const e = parseEntry(g.anchor, g.body, summary.periodEnd);
    if (e) entries.push(e);
    else skipped++;
  }
  if (skipped) warnings.push(`${skipped} entr${skipped === 1 ? "y" : "ies"} could not be read.`);

  let totalsCheck: PaytmParseResult["totalsCheck"] = "NOT_AVAILABLE";
  if (summary.reportedPaidPaise !== undefined && summary.reportedReceivedPaise !== undefined) {
    const paid = entries.filter((e) => e.kind === "PAID");
    const received = entries.filter((e) => e.kind === "RECEIVED");
    const sum = (xs: PaytmEntry[]) => xs.reduce((s, e) => s + e.amountPaise, 0);
    const ok =
      sum(paid) === summary.reportedPaidPaise &&
      sum(received) === summary.reportedReceivedPaise &&
      (summary.reportedPaidCount === undefined || paid.length === summary.reportedPaidCount) &&
      (summary.reportedReceivedCount === undefined || received.length === summary.reportedReceivedCount);
    totalsCheck = ok ? "PASSED" : "FAILED";
    if (!ok) warnings.push("The entries don't add up to Paytm's printed totals; some entries may have been misread.");
  }
  return { summary, entries, skipped, totalsCheck, warnings };
}

/**
 * Map a Paytm account label to an imported account: same bank, and the account number ends
 * with the printed digits ("Kotak Mahindra Bank - 61" → Kotak ••3661).
 */
export function matchPaytmAccount<T extends { bankName: string; accountLast4: string | null }>(
  label: string,
  accounts: T[],
): T | undefined {
  if (/credit card|gold coins|wallet/i.test(label)) return undefined;
  const m = /^(.*?)\s*-\s*(\d{2,4})$/.exec(label);
  if (!m) return undefined;
  const bankWords = m[1]
    .replace(/^Fi\s*\((.*)\)$/i, "$1")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !["bank", "the", "of"].includes(w));
  const hits = accounts.filter(
    (a) => a.accountLast4?.endsWith(m[2]) && bankWords.every((w) => a.bankName.toLowerCase().includes(w)),
  );
  return hits.length === 1 ? hits[0] : undefined;
}
