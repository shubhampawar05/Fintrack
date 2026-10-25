import { NextResponse, type NextRequest } from "next/server";
import { userFromRequestCookie } from "@/server/auth";
import { SESSION_COOKIE } from "@/server/session";
import { buildMonthlyReport } from "@/server/report";
import { paiseToRupeeInput } from "@/lib/money";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const user = await userFromRequestCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  const r = await buildMonthlyReport(user.id, month);
  const c = r.current;
  const rows: (string | number)[][] = [
    ["Fintrack monthly report", month],
    [],
    ["Metric", "Amount (INR)"],
    ["Total income", paiseToRupeeInput(c.income)],
    ["Total expenses", paiseToRupeeInput(c.expenses)],
    ["Net cash flow", paiseToRupeeInput(c.netCashFlow)],
    ["Savings", paiseToRupeeInput(c.savings)],
    ["Savings rate %", c.savingsRate ?? "n/a"],
    ["Investments", paiseToRupeeInput(c.investmentsIn)],
    ["Transfers between own accounts", paiseToRupeeInput(c.transfersOut)],
    ["Credit card bill payments", paiseToRupeeInput(c.ccPayments)],
    ["Cash withdrawals", paiseToRupeeInput(c.cashWithdrawals)],
    ["Unclassified outflows", paiseToRupeeInput(c.unclassifiedOut)],
    [],
    ["Category", "This month", "Previous month", "Change", "Share %"],
    ...c.expensesByCategory.map((x) => {
      const ch = r.changes.find((y) => y.categoryId === x.categoryId);
      return [x.name, paiseToRupeeInput(x.amountPaise), paiseToRupeeInput(ch?.previous ?? x.amountPaise), paiseToRupeeInput(ch?.change ?? 0), x.pct ?? ""];
    }),
    [],
    ["Largest expenses", "Date", "Amount", "Category"],
    ...r.largest.map((t) => [t.merchant, t.date, paiseToRupeeInput(t.amountPaise), t.categoryName]),
    [],
    ["Budget", "Budget", "Spent", "Remaining", "Used %"],
    ...r.budgets.map((b) => [b.name, paiseToRupeeInput(b.budget), paiseToRupeeInput(b.actual), paiseToRupeeInput(b.remaining), b.pctUsed ?? ""]),
    [],
    ["Observations"],
    ...r.insights.map((i) => [i.title, i.detail]),
    [],
    ["Data quality notes"],
    ...r.warnings.map((w) => [w.message]),
  ];
  return new NextResponse(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fintrack_report_${month}.csv"`, "Cache-Control": "no-store" },
  });
}
