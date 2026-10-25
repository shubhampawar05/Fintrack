import type { CategoryKind, Direction, RecurringFrequency, RecurringKind } from "@prisma/client";
import { addDays, daysBetween } from "@/lib/dates";

export interface RecurringInputTxn {
  id: string;
  date: string;
  direction: Direction;
  amountPaise: number;
  merchantKey: string | null;
  merchant: string;
  categoryKey?: string | null;
  categoryKind: CategoryKind;
}

export interface RecurringSuggestion {
  signature: string;
  label: string;
  merchantKey: string;
  direction: Direction;
  kind: RecurringKind;
  frequency: RecurringFrequency;
  typicalAmountPaise: number;
  minAmountPaise: number;
  maxAmountPaise: number;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  /** Only set when the cadence is regular enough to predict. */
  nextExpectedDate: string | null;
  confidence: number;
  transactionIds: string[];
}

const FREQUENCIES: { frequency: RecurringFrequency; days: number; tolerance: number }[] = [
  { frequency: "WEEKLY", days: 7, tolerance: 2 },
  { frequency: "MONTHLY", days: 30.4, tolerance: 6 },
  { frequency: "QUARTERLY", days: 91, tolerance: 12 },
  { frequency: "YEARLY", days: 365, tolerance: 20 },
];

/** Minimum occurrences before anything is called recurring (never on a single occurrence). */
export const MIN_OCCURRENCES = 3;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Group a merchant's transactions into amount bands (±15% or ±₹100 of the band median). */
function amountBands(txns: RecurringInputTxn[]): RecurringInputTxn[][] {
  const sorted = [...txns].sort((a, b) => a.amountPaise - b.amountPaise);
  const bands: RecurringInputTxn[][] = [];
  for (const t of sorted) {
    const band = bands[bands.length - 1];
    if (band) {
      const m = median(band.map((b) => b.amountPaise));
      if (Math.abs(t.amountPaise - m) <= Math.max(m * 0.15, 100_00)) {
        band.push(t);
        continue;
      }
    }
    bands.push([t]);
  }
  return bands;
}

function guessKind(categoryKey: string | null | undefined, direction: Direction, kind: CategoryKind): RecurringKind {
  if (direction === "CREDIT" && categoryKey === "salary") return "SALARY";
  switch (categoryKey) {
    case "rent":
      return "RENT";
    case "subscriptions":
      return "SUBSCRIPTION";
    case "insurance":
      return "INSURANCE";
    case "loans":
      return "EMI";
    case "family":
      return "FAMILY";
    case "bills":
    case "mobile":
      return "BILL";
    case "invest-in":
      return "INVESTMENT";
  }
  if (kind === "INVESTMENT") return "INVESTMENT";
  return "OTHER";
}

/**
 * Detect recurring payments/credits from cadence and amount consistency.
 * Requires ≥3 occurrences in a stable amount band and a regular interval.
 * Internal transfers and refunds are ignored.
 */
export function detectRecurring(txns: RecurringInputTxn[], today: string): RecurringSuggestion[] {
  const groups = new Map<string, RecurringInputTxn[]>();
  for (const t of txns) {
    if (!t.merchantKey || ["TRANSFER", "REFUND", "UNCLASSIFIED"].includes(t.categoryKind)) continue;
    if (["bank-charges", "bank-interest", "upi-refund", "upi-reversal", "unknown"].includes(t.merchantKey)) continue;
    const k = `${t.merchantKey}|${t.direction}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  const out: RecurringSuggestion[] = [];
  for (const [, group] of groups) {
    for (const band of amountBands(group)) {
      if (band.length < MIN_OCCURRENCES) continue;
      // Several payments on the same day count as one occurrence for cadence purposes.
      const byDate = [...band].sort((a, b) => (a.date < b.date ? -1 : 1));
      const dates = [...new Set(byDate.map((t) => t.date))];
      if (dates.length < MIN_OCCURRENCES) continue;
      const intervals = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
      const med = median(intervals);
      const freq = FREQUENCIES.find((f) => Math.abs(med - f.days) <= f.tolerance);
      if (!freq) continue;
      const regular = intervals.filter((iv) => Math.abs(iv - freq.days) <= freq.tolerance).length / intervals.length;
      if (regular < 0.6) continue;
      const amounts = band.map((t) => t.amountPaise);
      const typical = median(amounts);
      const spread = (Math.max(...amounts) - Math.min(...amounts)) / Math.max(typical, 1);
      const confidence = Math.min(0.95, 0.4 + 0.1 * Math.min(dates.length, 6) + 0.2 * regular - Math.min(spread, 0.3));
      const last = dates[dates.length - 1];
      const next = addDays(last, Math.round(freq.days));
      // Stale series (missed 2+ cycles) get no forecast.
      const stale = daysBetween(last, today) > freq.days * 2 + freq.tolerance;
      const first = band[0];
      out.push({
        signature: `${first.merchantKey}|${first.direction}|${Math.round(typical / 100_00)}`,
        label: first.merchant,
        merchantKey: first.merchantKey!,
        direction: first.direction,
        kind: guessKind(first.categoryKey, first.direction, first.categoryKind),
        frequency: freq.frequency,
        typicalAmountPaise: typical,
        minAmountPaise: Math.min(...amounts),
        maxAmountPaise: Math.max(...amounts),
        occurrences: dates.length,
        firstDate: dates[0],
        lastDate: last,
        nextExpectedDate: !stale && regular >= 0.75 ? next : null,
        confidence: Math.round(confidence * 100) / 100,
        transactionIds: band.map((t) => t.id),
      });
    }
  }
  return out.sort((a, b) => b.typicalAmountPaise - a.typicalAmountPaise);
}
