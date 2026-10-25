import "server-only";
import type { CategoryKind, Prisma } from "@prisma/client";
import { isoToDate } from "@/lib/dates";
import { parseAmountToPaise } from "@/lib/money";
import { rangeFromParams, readParam, type SearchParams } from "@/lib/range-params";

const KINDS: CategoryKind[] = ["INCOME", "EXPENSE", "TRANSFER", "CREDIT_CARD_PAYMENT", "INVESTMENT", "CASH", "REFUND", "SETTLEMENT", "UNCLASSIFIED"];

export const SORTS = {
  date_desc: [{ txnDate: "desc" }, { createdAt: "desc" }],
  date_asc: [{ txnDate: "asc" }, { createdAt: "asc" }],
  amount_desc: [{ amountPaise: "desc" }],
  amount_asc: [{ amountPaise: "asc" }],
} satisfies Record<string, Prisma.TransactionOrderByWithRelationInput[]>;

/** Translate URL filters into a Prisma where-clause, always scoped to the user. */
export function buildTransactionFilter(userId: string, sp: SearchParams) {
  const { preset, range, label } = rangeFromParams(sp, "all");
  const where: Prisma.TransactionWhereInput = { userId, txnDate: { gte: isoToDate(range.from), lte: isoToDate(range.to) } };
  const and: Prisma.TransactionWhereInput[] = [];
  const q = readParam(sp, "q")?.trim().slice(0, 100);
  if (q) {
    and.push({
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        { merchant: { contains: q, mode: "insensitive" } },
        { merchantOverride: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        { paymentAppEntry: { is: { OR: [{ payee: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }] } } },
      ],
    });
  }
  const account = readParam(sp, "account");
  if (account) where.accountId = account;
  const category = readParam(sp, "category");
  if (category === "none") where.categoryId = null;
  else if (category) where.categoryId = category;
  const kind = readParam(sp, "kind") as CategoryKind | undefined;
  if (kind && KINDS.includes(kind)) where.category = { kind };
  const direction = readParam(sp, "direction");
  if (direction === "DEBIT" || direction === "CREDIT") where.direction = direction;
  const min = parseAmountToPaise(readParam(sp, "min") ?? "");
  const max = parseAmountToPaise(readParam(sp, "max") ?? "");
  if (min !== null || max !== null) where.amountPaise = { ...(min !== null ? { gte: BigInt(Math.abs(min)) } : {}), ...(max !== null ? { lte: BigInt(Math.abs(max)) } : {}) };
  if (readParam(sp, "review") === "1") where.needsReview = true;
  const merchant = readParam(sp, "merchant");
  if (merchant) where.merchantKey = merchant;
  if (and.length) where.AND = and;
  const sortKey = (readParam(sp, "sort") ?? "date_desc") as keyof typeof SORTS;
  const orderBy = SORTS[sortKey] ?? SORTS.date_desc;
  return { where, orderBy, preset, range, label, sortKey: SORTS[sortKey] ? sortKey : "date_desc" };
}
