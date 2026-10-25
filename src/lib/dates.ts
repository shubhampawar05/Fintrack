/**
 * Date-only helpers. Transaction dates are calendar dates (no time zone), represented
 * as ISO strings "YYYY-MM-DD" in app code and as `@db.Date` (UTC midnight) in Postgres.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9,
  october: 10, november: 11, december: 12,
};

function valid(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function year(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

/**
 * Parse Indian bank date formats (day-first). Returns ISO date or null.
 * Supports: 27 Jul 2026, 27-Jul-2026, 28-OCT-2025, 04/07/2026, 04-07-26, 2026-07-04,
 * 04.07.2026, and Excel serial numbers.
 */
export function parseIndianDate(input: string | number | Date | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return valid(input.getFullYear(), input.getMonth() + 1, input.getDate());
  }
  if (typeof input === "number") return excelSerialToIso(input);
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(s))) return valid(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?: .*)?$/.exec(s))) return valid(year(m[3]), +m[2], +m[1]);
  if ((m = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]*(\d{2}|\d{4})(?: .*)?$/.exec(s))) {
    const mon = MONTHS[m[2].toLowerCase()];
    return mon ? valid(year(m[3]), mon, +m[1]) : null;
  }
  if ((m = /^([A-Za-z]{3,9}) (\d{1,2}),? (\d{4})$/.exec(s))) {
    const mon = MONTHS[m[1].toLowerCase()];
    return mon ? valid(+m[3], mon, +m[2]) : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));
  return null;
}

export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return valid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const now = new Date();
  // Local calendar day (user is in IST); avoid UTC shifting the day.
  return valid(now.getFullYear(), now.getMonth() + 1, now.getDate())!;
}

export function addDays(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToIso(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((isoToDate(b).getTime() - isoToDate(a).getTime()) / 86_400_000);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return dateToIso(d);
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return dateToIso(target);
}

export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = startOfMonth(from);
  while (cur <= to) {
    out.push(monthKey(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}

export function formatDate(iso: string, style: "short" | "long" | "month" = "short"): string {
  const d = isoToDate(iso);
  if (style === "month") return d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  if (style === "long") return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatMonth(key: string): string {
  return formatDate(`${key}-01`, "month");
}

export type RangePreset = "this-month" | "last-month" | "last-3-months" | "last-6-months" | "this-year" | "all" | "custom";

export interface DateRange {
  from: string;
  to: string;
}

/** Resolve a preset into an inclusive date range relative to `today`. */
export function resolveRange(preset: RangePreset, today: string, custom?: Partial<DateRange>): DateRange {
  switch (preset) {
    case "this-month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last-month": {
      const prev = addMonths(startOfMonth(today), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case "last-3-months":
      return { from: addMonths(startOfMonth(today), -2), to: endOfMonth(today) };
    case "last-6-months":
      return { from: addMonths(startOfMonth(today), -5), to: endOfMonth(today) };
    case "this-year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "all":
      return { from: "1900-01-01", to: "2200-12-31" };
    case "custom": {
      const from = custom?.from && parseIndianDate(custom.from) ? custom.from : startOfMonth(today);
      const to = custom?.to && parseIndianDate(custom.to) ? custom.to : endOfMonth(today);
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

/** The equally-long period immediately before `range` (used for comparisons). */
export function previousPeriod(range: DateRange): DateRange {
  // Calendar-month aligned ranges compare against the same number of previous months.
  if (range.from === startOfMonth(range.from) && range.to === endOfMonth(range.to)) {
    const months = monthsInRange(range.from, range.to).length;
    const from = addMonths(range.from, -months);
    return { from, to: addDays(range.from, -1) };
  }
  const len = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}
