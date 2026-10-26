import { resolveRange, todayIso, type DateRange, type RangePreset } from "@/lib/dates";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "last-6-months", label: "Last 6 months" },
  { value: "this-year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

/** Cookies remembering the last range / month the user picked, so pages don't reset to their defaults. */
export const RANGE_COOKIE = "ft_range";
export const MONTH_COOKIE = "ft_month";

/** Remember a filter choice for a year (client-side only). Values are plain [a-z0-9-|], so no encoding needed. */
export function rememberChoice(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export type SearchParams = Record<string, string | string[] | undefined>;

export function readParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export function rangeFromParams(sp: SearchParams, fallback: RangePreset = "last-3-months"): { preset: RangePreset; range: DateRange; label: string } {
  const raw = readParam(sp, "range") as RangePreset | undefined;
  const preset = RANGE_PRESETS.some((p) => p.value === raw) ? raw! : fallback;
  const range = resolveRange(preset, todayIso(), { from: readParam(sp, "from"), to: readParam(sp, "to") });
  const label = preset === "custom" ? `${range.from} → ${range.to}` : RANGE_PRESETS.find((p) => p.value === preset)!.label;
  return { preset, range, label };
}

/** Query-string fragment that preserves the current range when linking between pages. */
export function rangeQuery(preset: RangePreset, range: DateRange): Record<string, string> {
  return preset === "custom" ? { range: preset, from: range.from, to: range.to } : { range: preset };
}

export function href(path: string, q: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

export function monthFromParams(sp: SearchParams, fallback: string): string {
  const m = readParam(sp, "month");
  return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : fallback;
}
