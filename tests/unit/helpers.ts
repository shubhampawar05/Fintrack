import { DEFAULT_CATEGORIES, systemRuleRecords } from "@/lib/categorize/defaults";
import type { CategorizeContext } from "@/lib/categorize/engine";

/** Categorization context where each category id equals its key (for readable assertions). */
export function testContext(overrides: Partial<CategorizeContext> = {}): CategorizeContext {
  const categoryIdByKey = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.key, c.key]));
  return {
    rules: systemRuleRecords(categoryIdByKey).map((r, i) => ({ ...r, id: `sys-${i}` })),
    categoryIdByKey,
    ownIdentifiers: ["ASHA VERMA", "9800000000"],
    holderNames: ["Asha Verma"],
    ...overrides,
  };
}
