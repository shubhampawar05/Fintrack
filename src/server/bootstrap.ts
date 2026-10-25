import "server-only";
import { prisma } from "./db";
import { DEFAULT_CATEGORIES, systemRuleRecords } from "@/lib/categorize/defaults";

/** Idempotently create the user's settings, built-in categories and built-in rules. */
export async function ensureUserDefaults(userId: string): Promise<void> {
  await prisma.userSettings.upsert({ where: { userId }, update: {}, create: { userId } });
  const existing = await prisma.category.findMany({ where: { userId }, select: { key: true, id: true } });
  const have = new Set(existing.map((c) => c.key));
  const missing = DEFAULT_CATEGORIES.filter((c) => !have.has(c.key));
  if (missing.length) {
    await prisma.category.createMany({
      data: missing.map((c, i) => ({
        userId, key: c.key, name: c.name, kind: c.kind, group: c.group ?? null, color: c.color, isSystem: true,
        sortOrder: DEFAULT_CATEGORIES.indexOf(c) ?? i,
      })),
      skipDuplicates: true,
    });
  }
  const hasSystemRules = await prisma.categorizationRule.count({ where: { userId, isSystem: true } });
  if (!hasSystemRules) {
    const cats = await prisma.category.findMany({ where: { userId }, select: { key: true, id: true } });
    const byKey = Object.fromEntries(cats.filter((c) => c.key).map((c) => [c.key!, c.id]));
    await prisma.categorizationRule.createMany({ data: systemRuleRecords(byKey).map((r) => ({ ...r, userId })) });
  }
}
