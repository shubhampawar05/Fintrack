import { z } from "zod";
import { parseAmountToPaise } from "@/lib/money";
import { parseIndianDate } from "@/lib/dates";

/** Rupee amount entered by the user, converted to integer paise. */
export const rupees = z
  .string()
  .trim()
  .refine((v) => parseAmountToPaise(v) !== null, "Enter a valid amount, e.g. 12,500.00")
  .transform((v) => parseAmountToPaise(v)!);

export const positiveRupees = rupees.refine((v) => v > 0, "Amount must be greater than zero");

export const isoDate = z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && parseIndianDate(v) !== null, "Enter a valid date");

export const accountSchema = z.object({
  displayName: z.string().trim().min(1, "Required").max(60),
  bankName: z.string().trim().min(1, "Required").max(80),
  accountType: z.enum(["SAVINGS", "CURRENT", "SALARY", "CREDIT_CARD", "WALLET", "OTHER"]),
  currency: z.string().trim().length(3).default("INR"),
  accountLast4: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, "Last 4 digits only")
    .optional(),
  openingBalance: z.string().trim().optional(),
  openingBalanceDate: z.string().trim().optional(),
});
export type AccountInput = z.input<typeof accountSchema>;

export const ruleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  field: z.enum(["DESCRIPTION", "MERCHANT"]),
  matchType: z.enum(["CONTAINS", "STARTS_WITH", "EQUALS", "REGEX"]),
  pattern: z
    .string()
    .trim()
    .min(2, "Pattern is too short")
    .max(300),
  direction: z.enum(["DEBIT", "CREDIT", "ANY"]).default("ANY"),
  accountId: z.string().optional(),
  categoryId: z.string().min(1, "Choose a category"),
  merchantName: z.string().trim().max(80).optional(),
  priority: z.coerce.number().int().min(1).max(99).default(10),
  enabled: z.boolean().default(true),
});
export type RuleInput = z.input<typeof ruleSchema>;

export const budgetSchema = z.object({ categoryId: z.string().min(1), amount: positiveRupees });
export const goalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  target: positiveRupees,
  current: rupees.refine((v) => v >= 0, "Cannot be negative"),
  targetDate: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const transactionPatchSchema = z.object({
  categoryId: z.string().optional(),
  merchantOverride: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const manualTransactionSchema = z.object({
  accountId: z.string().min(1),
  date: isoDate,
  description: z.string().trim().min(1).max(200),
  amount: positiveRupees,
  direction: z.enum(["DEBIT", "CREDIT"]),
  categoryId: z.string().min(1),
  notes: z.string().max(500).optional(),
});
