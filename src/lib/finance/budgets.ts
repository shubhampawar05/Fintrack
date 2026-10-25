import { percent, type Paise } from "@/lib/money";

export function budgetStatus(budget: Paise, actual: Paise) {
  const pctUsed = percent(actual, budget);
  const remaining = budget - actual;
  const status: "ok" | "near" | "over" = actual > budget ? "over" : pctUsed !== null && pctUsed >= 85 ? "near" : "ok";
  return { budget, actual, remaining, pctUsed, status };
}

/** Monthly amount needed to reach a goal by its target date (null when no date or already reached). */
export function requiredMonthly(target: Paise, current: Paise, monthsLeft: number | null): Paise | null {
  if (current >= target) return 0;
  if (monthsLeft === null) return null;
  return Math.ceil((target - current) / Math.max(monthsLeft, 1));
}
