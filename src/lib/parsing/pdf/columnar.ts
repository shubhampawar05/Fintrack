import { isAmountToken, parseAmountToPaise } from "@/lib/money";
import { parseIndianDate } from "@/lib/dates";
import type { Direction, ParsedRow } from "../types";
import type { PdfItem, PdfLine } from "./extract";

/**
 * Generic engine for PDF statements laid out as a table with a header row.
 *
 * Strategy:
 *  1. Find the header line on each page (it contains the date and balance headings).
 *  2. A transaction starts on an "anchor" line: one with a date token at the left.
 *  3. Amount tokens are assigned to debit / credit / balance by the nearest header
 *     right edge (bank PDFs right-align numeric columns).
 *  4. Wrapped description lines are attached to the anchor below/nearest to them.
 * Direction is later re-verified against the running balance in `finalizeRows`.
 */

export interface ColumnarConfig {
  headers: {
    date: RegExp;
    valueDate?: RegExp;
    description: RegExp;
    reference?: RegExp;
    type?: RegExp;
    channel?: RegExp;
    debit: RegExp;
    credit: RegExp;
    balance: RegExp;
  };
  /** Pattern a date cell must match to start a new row. */
  rowDate: RegExp;
  /** Where wrapped description lines sit relative to the anchor row. */
  continuation: "below" | "nearest";
  /** Max vertical distance (pt) for a continuation line to belong to a row. */
  maxContinuationGap?: number;
  /** A line matching this ends the table on that page. */
  stop?: RegExp;
  /** Lines matching this inside the table are ignored. */
  skip?: RegExp;
  /** Join wrapped description fragments without spaces when they split mid-token. */
  joinMode?: "space" | "smart";
}

const MAX_CONTINUATION_LINES = 4;

interface HeaderLayout {
  page: number;
  y: number;
  dateX: number;
  descRight: number;
  textCols: { key: "reference" | "type" | "channel"; x: number }[];
  amountCols: { key: "debit" | "credit" | "balance"; right: number }[];
}

function findItem(items: PdfItem[], re: RegExp): PdfItem | undefined {
  return items.find((i) => re.test(i.str));
}

function detectHeader(lines: PdfLine[], idx: number, cfg: ColumnarConfig): HeaderLayout | null {
  const line = lines[idx];
  const h = cfg.headers;
  const date = findItem(line.items, h.date);
  const balance = findItem(line.items, h.balance);
  if (!date || !balance) return null;
  // Merge multi-line headings (e.g. "Tran / Type", "Cheque / Reference No").
  const band = lines.filter((l) => l.page === line.page && Math.abs(l.y - line.y) <= 12).flatMap((l) => l.items);
  const debit = findItem(band, h.debit);
  const credit = findItem(band, h.credit);
  if (!debit || !credit) return null;
  const textCols: HeaderLayout["textCols"] = [];
  for (const key of ["reference", "type", "channel"] as const) {
    const re = h[key];
    if (!re) continue;
    const xs = band.filter((i) => re.test(i.str)).map((i) => i.x);
    if (xs.length) textCols.push({ key, x: Math.min(...xs) });
  }
  const firstNonDesc = Math.min(debit.x, credit.x, ...textCols.filter((c) => c.key !== "channel").map((c) => c.x));
  return {
    page: line.page,
    y: line.y,
    dateX: date.x,
    descRight: firstNonDesc - 8,
    textCols,
    amountCols: [
      { key: "debit", right: debit.xEnd },
      { key: "credit", right: credit.xEnd },
      { key: "balance", right: balance.xEnd },
    ],
  };
}

interface RowDraft {
  anchor: PdfLine;
  layout: HeaderLayout;
  extra: PdfLine[];
}

export function joinFragments(parts: string[], mode: "space" | "smart"): string {
  let out = "";
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (!out) out = part;
    else if (mode === "smart" && (/[/@.\-_]$/.test(out) || /^[/@.\-_]/.test(part))) out += part;
    else out += ` ${part}`;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function parseColumnarPdf(lines: PdfLine[], cfg: ColumnarConfig): { rows: ParsedRow[]; headerFound: boolean } {
  const drafts: RowDraft[] = [];
  const orphans: PdfLine[] = [];
  let layout: HeaderLayout | null = null;
  let inTable = false;
  let headerFound = false;
  let page = 0;
  let headerY = Infinity;
  const gap = cfg.maxContinuationGap ?? 30;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.page !== page) {
      // Many banks print the column header only on the first page; the table carries over.
      page = line.page;
      headerY = Infinity;
    }
    const hdr = detectHeader(lines, i, cfg);
    if (hdr) {
      layout = hdr;
      inTable = true;
      headerFound = true;
      headerY = hdr.y;
      // Page banners above the header are not transaction text.
      for (let k = orphans.length - 1; k >= 0; k--) if (orphans[k].page === page) orphans.splice(k, 1);
      const last = drafts[drafts.length - 1];
      if (last) last.extra = last.extra.filter((l) => !(l.page === page && l.y > hdr.y));
      continue;
    }
    if (!inTable || !layout) continue;
    if (line.y > headerY - 6) continue; // multi-line header remnants
    if (cfg.stop?.test(line.text)) {
      inTable = false;
      continue;
    }
    if (cfg.skip?.test(line.text)) continue;
    const dateItem = line.items.find((it) => it.x < layout!.descRight && cfg.rowDate.test(it.str));
    if (dateItem && parseIndianDate(dateItem.str.match(cfg.rowDate)![0])) {
      drafts.push({ anchor: line, layout, extra: [] });
    } else if (line.items.some((it) => isAmountToken(it.str))) {
      // Amounts outside an anchor row are summaries/footers, never wrapped narration.
      continue;
    } else if (line.items[0].x < layout.dateX - 8) {
      // Wrapped narration never starts left of the table; this is a page banner (name, account no.).
      continue;
    } else if (cfg.continuation === "below") {
      // Wrapped text belongs to the most recent row in reading order (also across page breaks).
      const last = drafts[drafts.length - 1];
      const withinGap = last && (last.anchor.page !== line.page || last.anchor.y - line.y <= gap);
      if (last && withinGap && last.extra.length < MAX_CONTINUATION_LINES) last.extra.push(line);
    } else {
      orphans.push(line);
    }
  }

  for (const line of orphans) {
    const target = drafts
      .filter((d) => d.anchor.page === line.page)
      .sort((a, b) => Math.abs(a.anchor.y - line.y) - Math.abs(b.anchor.y - line.y))[0];
    if (target && Math.abs(target.anchor.y - line.y) <= gap) target.extra.push(line);
  }

  const rows: ParsedRow[] = drafts.map((d, rowIndex) => buildRow(d, rowIndex, cfg));
  return { rows, headerFound };
}

function nearestAmountCol(item: PdfItem, layout: HeaderLayout): "debit" | "credit" | "balance" {
  let best = layout.amountCols[0];
  for (const c of layout.amountCols) {
    if (Math.abs(c.right - item.xEnd) < Math.abs(best.right - item.xEnd)) best = c;
  }
  return best.key;
}

function buildRow(d: RowDraft, rowIndex: number, cfg: ColumnarConfig): ParsedRow {
  const { layout } = d;
  // Reading order: page, then top-to-bottom.
  const all = [d.anchor, ...d.extra].sort((a, b) => a.page - b.page || b.y - a.y);
  const descParts: string[] = [];
  const refParts: string[] = [];
  const raw: Record<string, string> = {};
  const dates: string[] = [];
  let debit: string | undefined;
  let credit: string | undefined;
  let balance: string | undefined;
  let balanceSign = 1;

  for (const line of all) {
    const isAnchor = line === d.anchor;
    for (const it of line.items) {
      const s = it.str;
      if (isAnchor && it.x < layout.descRight && cfg.rowDate.test(s) && dates.length < 2) {
        dates.push(s.match(cfg.rowDate)![0]);
        continue;
      }
      if (isAnchor && it.xEnd <= layout.dateX && /^\d{1,5}$/.test(s)) {
        raw.serial = s;
        continue;
      }
      if (it.x >= layout.descRight && /^(cr|dr)\.?$/i.test(s)) {
        if (/^dr/i.test(s)) balanceSign = -1;
        continue;
      }
      if (it.x >= layout.descRight - 40 && isAmountToken(s)) {
        const col = nearestAmountCol(it, layout);
        if (col === "debit") debit = s;
        else if (col === "credit") credit = s;
        else balance = s;
        continue;
      }
      if (it.x < layout.descRight) {
        descParts.push(s);
        continue;
      }
      if (/^-$/.test(s)) continue;
      // Remaining text: nearest text column (reference / type / channel).
      const col = layout.textCols.length
        ? layout.textCols.reduce((a, b) => (Math.abs(b.x - it.x) < Math.abs(a.x - it.x) ? b : a))
        : undefined;
      if (col?.key === "reference") refParts.push(s);
      else if (col) raw[col.key] = raw[col.key] ? `${raw[col.key]} ${s}` : s;
      else descParts.push(s);
    }
  }

  let description = joinFragments(descParts, cfg.joinMode ?? "space");
  let valueDate: string | null = dates[1] ? parseIndianDate(dates[1]) : null;
  const embedded = /\(Value Date: ([0-9]{2}-[0-9]{2}-[0-9]{4})\)/i.exec(description);
  if (embedded) {
    valueDate = parseIndianDate(embedded[1]);
    description = description.replace(embedded[0], "").trim();
  }

  const debitPaise = debit ? parseAmountToPaise(debit) : null;
  const creditPaise = credit ? parseAmountToPaise(credit) : null;
  const balancePaise = balance ? parseAmountToPaise(balance)! * balanceSign : null;

  const errors: string[] = [];
  let amountPaise: number | null = null;
  let direction: Direction | null = null;
  if (debitPaise && creditPaise) {
    errors.push("Row has both a debit and a credit amount");
  } else if (debitPaise) {
    amountPaise = Math.abs(debitPaise);
    direction = "DEBIT";
  } else if (creditPaise) {
    amountPaise = Math.abs(creditPaise);
    direction = "CREDIT";
  }

  Object.assign(raw, {
    date: dates[0] ?? "",
    ...(dates[1] ? { valueDate: dates[1] } : {}),
    description: joinFragments(descParts, cfg.joinMode ?? "space"),
    ...(refParts.length ? { reference: refParts.join(" ") } : {}),
    ...(debit ? { debit } : {}),
    ...(credit ? { credit } : {}),
    ...(balance ? { balance: balanceSign < 0 ? `${balance} Dr` : balance } : {}),
  });

  return {
    rowIndex,
    page: d.anchor.page,
    txnDate: dates[0] ? parseIndianDate(dates[0]) : null,
    valueDate,
    description,
    reference: refParts.length ? refParts.join("").trim() : null,
    amountPaise,
    direction,
    balancePaise,
    raw,
    errors,
    warnings: [],
  };
}
