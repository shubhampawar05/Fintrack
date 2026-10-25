import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { userFromRequestCookie } from "@/server/auth";
import { SESSION_COOKIE } from "@/server/session";
import { buildTransactionFilter } from "@/server/transactions-query";
import { dateToIso } from "@/lib/dates";
import { paiseToRupeeInput, toPaise } from "@/lib/money";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";

/** CSV export of the currently filtered transactions. */
export async function GET(req: NextRequest) {
  const user = await userFromRequestCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { where, orderBy, range } = buildTransactionFilter(user.id, sp);
  const rows = await prisma.transaction.findMany({ where, orderBy, include: { account: true, category: { include: { parent: true } }, paymentAppEntry: true }, take: 50000 });
  const csv = toCsv([
    ["Date", "Value date", "Account", "Description", "Merchant", "Debit/Credit", "Amount (INR)", "Category", "Category type", "Method", "Confidence", "Needs review", "Reference", "Notes", "Paytm payee", "Paytm note", "Paytm tags"],
    ...rows.map((t) => [
      dateToIso(t.txnDate), t.valueDate ? dateToIso(t.valueDate) : "", t.account.displayName, t.description, t.merchantOverride || t.merchant || "",
      t.direction, paiseToRupeeInput(toPaise(t.amountPaise)), t.category?.name ?? "Unclassified", t.category?.kind ?? "UNCLASSIFIED",
      t.categorizationMethod, t.confidence.toFixed(2), t.needsReview ? "yes" : "no", t.reference ?? "", t.notes ?? "",
      t.paymentAppEntry?.payee ?? "", t.paymentAppEntry?.note ?? "", t.paymentAppEntry?.tags.map((x) => `#${x}`).join(" ") ?? "",
    ]),
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions_${range.from === "1900-01-01" ? "all" : `${range.from}_${range.to}`}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
