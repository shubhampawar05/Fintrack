import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { formatDate, dateToIso } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PreferencesForm } from "./preferences-form";
import { CategoryManager } from "./category-manager";
import { RuleManager } from "./rule-manager";
import { DangerZone } from "./danger-zone";

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, categories, counts, rules, accounts, logs] = await Promise.all([
    prisma.userSettings.findUniqueOrThrow({ where: { userId: user.id } }),
    prisma.category.findMany({ where: { userId: user.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.transaction.groupBy({ by: ["categoryId"], where: { userId: user.id }, _count: true }),
    prisma.categorizationRule.findMany({ where: { userId: user.id }, include: { category: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
    prisma.bankAccount.findMany({ where: { userId: user.id }, select: { id: true, displayName: true } }),
    prisma.auditLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="Accounting preferences, categories, rules and your data." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Accounting preferences</CardTitle>
            <CardDescription>These decide what counts as income, spending or a transfer.</CardDescription>
          </CardHeader>
          <CardContent>
            <PreferencesForm
              initial={{ ownIdentifiers: settings.ownIdentifiers, transferWindowDays: settings.transferWindowDays, ccPaymentTreatment: settings.ccPaymentTreatment, aiCategorization: settings.aiCategorization }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Rename built-in categories, change spending groups, or add your own (including subcategories).</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryManager
              categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, group: c.group, isSystem: c.isSystem, parentId: c.parentId, count: counts.find((x) => x.categoryId === c.id)?._count ?? 0 }))}
            />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Categorization rules</CardTitle>
            <CardDescription>Deterministic rules run first; anything they can’t decide confidently is flagged for your review instead of guessed.</CardDescription>
          </CardHeader>
          <CardContent>
            <RuleManager
              rules={rules.map((r) => ({
                id: r.id, name: r.name, field: r.field, matchType: r.matchType, pattern: r.pattern, direction: r.direction, accountId: r.accountId,
                categoryId: r.categoryId, categoryName: r.category.name, merchantName: r.merchantName,
                minAmountPaise: r.minAmountPaise === null ? null : toPaise(r.minAmountPaise), maxAmountPaise: r.maxAmountPaise === null ? null : toPaise(r.maxAmountPaise),
                priority: r.priority, enabled: r.enabled, isSystem: r.isSystem,
              }))}
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
              accounts={accounts.map((a) => ({ id: a.id, name: a.displayName }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Audit trail</CardTitle>
            <CardDescription>Recent corrections, reclassifications and imports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(dateToIso(l.createdAt))} {l.createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-xs">{l.entity}</TableCell>
                      <TableCell className="text-xs">{l.action.toLowerCase().replace(/_/g, " ")}</TableCell>
                    </TableRow>
                  ))}
                  {!logs.length && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                        Nothing yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Privacy & data</CardTitle>
            <CardDescription>What is stored, and how to remove it</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Statement files are parsed in memory and never stored. Kept: extracted rows (for audit), transactions, and a SHA-256 fingerprint of each file to prevent re-imports. Only the last 4 digits of account numbers are saved. PDF passwords are never stored.</p>
            <p>Delete a single statement (optionally with its transactions) from Import history, or an account with all its data from Bank Accounts.</p>
            <DangerZone />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
