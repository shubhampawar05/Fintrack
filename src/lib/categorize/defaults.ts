import type { CategoryKind, Direction, SpendGroup } from "@prisma/client";

export interface CategoryDef {
  key: string;
  name: string;
  kind: CategoryKind;
  group?: SpendGroup;
  color: string;
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  // Income
  { key: "salary", name: "Salary", kind: "INCOME", color: "#16a34a" },
  { key: "bonus", name: "Bonus", kind: "INCOME", color: "#22c55e" },
  { key: "business-income", name: "Freelance or business income", kind: "INCOME", color: "#4ade80" },
  { key: "interest", name: "Interest and cashback", kind: "INCOME", color: "#86efac" },
  { key: "other-income", name: "Other income", kind: "INCOME", color: "#bbf7d0" },
  // Expenses
  { key: "rent", name: "Rent and housing", kind: "EXPENSE", group: "ESSENTIAL", color: "#6366f1" },
  { key: "groceries", name: "Groceries", kind: "EXPENSE", group: "ESSENTIAL", color: "#0ea5e9" },
  { key: "food", name: "Restaurants and food delivery", kind: "EXPENSE", group: "DISCRETIONARY", color: "#f97316" },
  { key: "transport", name: "Transportation and fuel", kind: "EXPENSE", group: "ESSENTIAL", color: "#14b8a6" },
  { key: "shopping", name: "Shopping", kind: "EXPENSE", group: "DISCRETIONARY", color: "#ec4899" },
  { key: "bills", name: "Bills and utilities", kind: "EXPENSE", group: "ESSENTIAL", color: "#8b5cf6" },
  { key: "mobile", name: "Mobile and internet", kind: "EXPENSE", group: "ESSENTIAL", color: "#a855f7" },
  { key: "subscriptions", name: "Subscriptions", kind: "EXPENSE", group: "DISCRETIONARY", color: "#d946ef" },
  { key: "health", name: "Healthcare", kind: "EXPENSE", group: "ESSENTIAL", color: "#ef4444" },
  { key: "fitness", name: "Fitness and sports", kind: "EXPENSE", group: "DISCRETIONARY", color: "#84cc16" },
  { key: "travel", name: "Travel", kind: "EXPENSE", group: "DISCRETIONARY", color: "#06b6d4" },
  { key: "entertainment", name: "Entertainment", kind: "EXPENSE", group: "DISCRETIONARY", color: "#f43f5e" },
  { key: "family", name: "Family support", kind: "EXPENSE", group: "FAMILY", color: "#eab308" },
  { key: "education", name: "Education", kind: "EXPENSE", group: "ESSENTIAL", color: "#3b82f6" },
  { key: "insurance", name: "Insurance", kind: "EXPENSE", group: "ESSENTIAL", color: "#0d9488" },
  { key: "loans", name: "Loan payments and interest", kind: "EXPENSE", group: "ESSENTIAL", color: "#b45309" },
  { key: "bank-charges", name: "Bank charges", kind: "EXPENSE", group: "ESSENTIAL", color: "#78716c" },
  { key: "other-expense", name: "Other expenses", kind: "EXPENSE", group: "DISCRETIONARY", color: "#a8a29e" },
  // Financial movements
  { key: "transfer", name: "Transfers between my own accounts", kind: "TRANSFER", color: "#64748b" },
  { key: "cc-payment", name: "Credit card payments", kind: "CREDIT_CARD_PAYMENT", color: "#475569" },
  { key: "invest-in", name: "Investment contributions", kind: "INVESTMENT", color: "#059669" },
  { key: "invest-out", name: "Investment withdrawals", kind: "INVESTMENT", color: "#10b981" },
  { key: "refund", name: "Refunds and reversals", kind: "REFUND", color: "#94a3b8" },
  { key: "cash", name: "Cash withdrawals", kind: "CASH", color: "#9ca3af" },
  { key: "lending", name: "Personal lending and repayments", kind: "SETTLEMENT", color: "#cbd5e1" },
  { key: "unclassified", name: "Unclassified", kind: "UNCLASSIFIED", color: "#d4d4d8" },
];

export interface SystemRuleDef {
  name: string;
  pattern: string; // case-insensitive regex over the description
  categoryKey: string;
  direction?: Direction;
  merchantName?: string;
  /** Confidence for matches; below 0.8 the transaction is flagged for review. */
  confidence?: number;
}

/**
 * Built-in deterministic rules, evaluated in order (first match wins).
 * They are seeded into the database as editable rules with priority >= 100.
 */
export const SYSTEM_RULES: SystemRuleDef[] = [
  { name: "Bank charges", pattern: String.raw`^CHRG/|MONTHLY SMS|^GST$|\bAMC\b|NACH RETURN|MIN(IMUM)? BAL|CHARGES? (FOR|DEBIT)|SERVICE CHARGE`, categoryKey: "bank-charges", direction: "DEBIT" },
  { name: "ATM cash withdrawals", pattern: String.raw`\bATW\b|\bATL\b|ATM ?(WDL|CASH)|CASH WITHDRAWAL|\bNWD\b|\bCASH WDL`, categoryKey: "cash", direction: "DEBIT" },
  { name: "Debit card (ATM or POS — confirm)", pattern: String.raw`^\d{6}X{4,}\d{4}\b`, categoryKey: "cash", direction: "DEBIT", confidence: 0.6 },
  { name: "Savings interest", pattern: String.raw`Int\.?Pd|^SBINT|BY INTT|INTEREST (CREDIT|PAID)|CREDIT INTEREST`, categoryKey: "interest", direction: "CREDIT", merchantName: "Bank interest" },
  { name: "Refunds & reversals", pattern: String.raw`REFUND|REVERSAL|\bREV\b|DEBITREV|CHARGEBACK`, categoryKey: "refund", direction: "CREDIT", confidence: 0.9 },
  { name: "Salary credit", pattern: String.raw`SALARY|\bSAL (CR|CREDIT)\b|PAYROLL`, categoryKey: "salary", direction: "CREDIT" },
  { name: "Bonus", pattern: String.raw`\bBONUS\b|INCENTIVE`, categoryKey: "bonus", direction: "CREDIT" },
  { name: "Credit card bill payments", pattern: String.raw`cred\.club|credclub|fcpgaxisbankbsfi|/cc\.\d+@|sbicard|chqcc|ccbillpay|amazonpayccbill|billdeskpg\.sbicards|supercard@|jupiterupicollect|CREDIT CARD|VISACCPAY|^MB FT/\d+/CREDIT/\d{4}|/CheQ/|kotak811payments`, categoryKey: "cc-payment", direction: "DEBIT" },
  { name: "Card issuer cashback / credits", pattern: String.raw`SBI CARDS AND PAYMENTS|CARDS AND PAYMENTS`, categoryKey: "interest", direction: "CREDIT", confidence: 0.7 },
  { name: "Mutual funds & brokers (in)", pattern: String.raw`MUTUAL FUNDS? (ICCL|NCL)|\bICCL\b|GROWW|ZERODHA|UPSTOX|INDMONEY|KUVERA|BSE ?STAR|NSE CLEARING|\bCAMS\b|KFINTECH|ANGEL ?ONE|\bNPS\b|SUKANYA|WINT ?WEALTH|GRIP ?INVEST|curie\d*\.rzp`, categoryKey: "invest-in", direction: "DEBIT" },
  { name: "Mutual fund redemptions", pattern: String.raw`MUTUAL FUND|\bMF\b|GROWW|ZERODHA|ICCL|REDEMPTION`, categoryKey: "invest-out", direction: "CREDIT", confidence: 0.75 },
  { name: "Bond / P2P payouts", pattern: String.raw`KANAKADURGA|SPANDANA SPHOORTY|NAVI FINSERV|LENDENCLUB|FAIRCENT`, categoryKey: "invest-out", direction: "CREDIT", confidence: 0.7 },
  { name: "Account verification credit", pattern: String.raw`INDIAIDEASCOM|PENNY ?DROP|ACC(OUNT)? VERIF`, categoryKey: "other-income", direction: "CREDIT", confidence: 0.7 },
  { name: "Insurance", pattern: String.raw`INSURANCE|\bLIC(I)?\b|POLICYBAZAAR|HDFC ?LIFE|ICICI ?PRU ?LIFE|MAX ?LIFE|TATA ?AIA|STAR ?HEALTH|NIVA ?BUPA|\bACKO\b|GO ?DIGIT|PREMIUM`, categoryKey: "insurance", direction: "DEBIT" },
  { name: "Rent", pattern: String.raw`\bRENT\b|NOBROKER|NESTAWAY|SOCIETY MAINT|MAINTENANCE CHARGES`, categoryKey: "rent", direction: "DEBIT", confidence: 0.8 },
  { name: "Groceries", pattern: String.raw`BLINKIT|ZEPTO|BIGBASKET|INSTAMART|\bDMART\b|AVENUE SUPERMART|JIOMART|GROFERS|RELIANCE (FRESH|SMART|RETAIL)|SPENCER|MILKBASKET|COUNTRY ?DELIGHT|KIRANA|GROCER`, categoryKey: "groceries", direction: "DEBIT" },
  { name: "Food & delivery", pattern: String.raw`SWIGGY|ZOMATO|DOMINO|PIZZA|MCDONALD|\bKFC\b|BURGER|STARBUCKS|CAFE|RESTAURANT|DHABA|EATSURE|CHAAYOS|HALDIRAM|SWEETS|BAKERY|\bMITHAI\b|JUICE|CHAI\b|TEA STALL`, categoryKey: "food", direction: "DEBIT", confidence: 0.85 },
  { name: "Travel", pattern: String.raw`MAKEMYTRIP|GOIBIBO|CLEARTRIP|\bYATRA\b|INDIGO|AIR ?INDIA|SPICEJET|AKASA|\bOYO\b|AIRBNB|BOOKING\.COM|AGODA|IXIGO|REDBUS|ABHIBUS`, categoryKey: "travel", direction: "DEBIT" },
  { name: "Transport & fuel", pattern: String.raw`\bUBER\b|OLACABS|\bOLA\b|RAPIDO|IRCTC|\bMETRO\b|FASTAG|PETROL|\bFUEL\b|HPCL|BPCL|IOCL|INDIAN ?OIL|PARKING|NAMMA ?YATRI|BLUSMART`, categoryKey: "transport", direction: "DEBIT" },
  { name: "Subscriptions", pattern: String.raw`NETFLIX|SPOTIFY|YOUTUBE|GOOGLE ?PLAY|APPLE\.COM|ITUNES|PRIME ?VIDEO|AMAZON ?PRIME|HOTSTAR|JIOCINEMA|SONYLIV|\bZEE5\b|KUKU ?FM|AUDIBLE|OPENAI|CHATGPT|ANTHROPIC|MICROSOFT|ADOBE|LINKEDIN`, categoryKey: "subscriptions", direction: "DEBIT" },
  { name: "Shopping", pattern: String.raw`AMAZON|AMZN|FLIPKART|MYNTRA|\bAJIO\b|MEESHO|NYKAA|TATA ?CLIQ|DECATHLON|CROMA|RELIANCE DIGITAL|\bIKEA\b|LENSKART|SNAPDEAL|SHOPSY`, categoryKey: "shopping", direction: "DEBIT", confidence: 0.85 },
  { name: "Mobile & internet", pattern: String.raw`\bJIO\b|AIRTEL|VODAFONE|\bVI ?(PREPAID|POSTPAID)\b|BSNL|FIBERNET|HATHWAY|RECHARGE|PREPAID|POSTPAID|BROADBAND`, categoryKey: "mobile", direction: "DEBIT" },
  { name: "Bills & utilities", pattern: String.raw`ELECTRICITY|BESCOM|MSEDCL|TATA ?POWER|ADANI ?(ELECTRICITY|GAS)|\bBSES\b|WATER BILL|INDANE|HP ?GAS|BHARAT ?GAS|\bBBPS\b|MPPKVVCL|MPEZ|\bDTH\b|TATA ?PLAY`, categoryKey: "bills", direction: "DEBIT", confidence: 0.85 },
  { name: "Healthcare", pattern: String.raw`PHARM|MEDICOS?\b|MEDICAL|CHEMIST|APOLLO|HOSPITAL|CLINIC|PRACTO|\b1MG\b|NETMEDS|DIAGNOS|PATHOLOG|DENTAL`, categoryKey: "health", direction: "DEBIT" },
  { name: "Fitness", pattern: String.raw`\bGYM\b|FITNESS|CULT ?FIT|CUREFIT|\bYOGA\b|\bTURF\b|BADMINTON|SWIMMING`, categoryKey: "fitness", direction: "DEBIT", confidence: 0.8 },
  { name: "Entertainment", pattern: String.raw`BOOKMYSHOW|\bPVR\b|\bINOX\b|CINEPOLIS|DISTRICT\.IN|PAYTM ?INSIDER|DREAM ?11|\bSTEAM\b`, categoryKey: "entertainment", direction: "DEBIT" },
  { name: "Education & exams", pattern: String.raw`UDEMY|COURSERA|SCHOOL|COLLEGE|UNIVERSITY|TUITION|BYJU|UNACADEMY|\bEXAM\b|/RRB\b|RECRUITMENT`, categoryKey: "education", direction: "DEBIT", confidence: 0.85 },
  { name: "Loans & EMIs", pattern: String.raw`\bEMI\b|LOAN|BAJAJ ?FIN|HOME ?CREDIT|KREDITBEE|MONEYVIEW|CASHE|LAZYPAY|SIMPL\b|FINNABLE`, categoryKey: "loans", direction: "DEBIT", confidence: 0.85 },
];

/** Merchant category code → category key (debits only). */
export const MCC_CATEGORY: Record<string, string> = {};
const mccGroups: [string, string[]][] = [
  ["groceries", ["5411", "5422", "5441", "5451", "5499", "5300"]],
  ["food", ["5462", "5811", "5812", "5813", "5814"]],
  ["transport", ["4111", "4112", "4121", "4131", "4784", "4789", "5172", "5541", "5542", "5983", "7523", "7512"]],
  ["travel", ["4411", "4511", "4582", "4722", "7011", "7012", "7032", "7033"]],
  ["mobile", ["4812", "4814", "4816"]],
  ["subscriptions", ["4899", "5734", "5815", "5816", "5817", "5818", "7372"]],
  ["bills", ["4900"]],
  ["health", ["5122", "5912", "5975", "5976", "8011", "8021", "8031", "8041", "8042", "8043", "8049", "8050", "8062", "8071", "8099"]],
  ["fitness", ["5655", "5941", "7911", "7941", "7997"]],
  ["entertainment", ["7832", "7841", "7922", "7929", "7991", "7993", "7994", "7996", "7998", "7999"]],
  ["education", ["5942", "8211", "8220", "8241", "8244", "8249", "8299"]],
  ["insurance", ["5960", "6300", "6381"]],
  ["invest-in", ["6211"]],
  ["shopping", ["5045", "5065", "5094", "5137", "5139", "5200", "5211", "5251", "5261", "5262", "5309", "5310", "5311", "5331", "5399", "5611", "5621", "5631", "5641", "5651", "5661", "5691", "5699", "5712", "5719", "5722", "5732", "5733", "5735", "5943", "5944", "5945", "5946", "5947", "5948", "5949", "5977", "5992", "5993", "5995", "5999"]],
  ["other-expense", ["7210", "7211", "7216", "7230", "7298", "5921", "9311", "9399", "9222", "9402"]],
];
for (const [key, codes] of mccGroups) for (const c of codes) MCC_CATEGORY[c] = key;

/**
 * Payment-app tags (Paytm "#Food", "#rapido both", "#monthly FD") → category key, for debits.
 * Only tags that name a spending type; generic app tags ("Money Transfer", "Miscellaneous",
 * "Bill Payments", "Financial Services") and personal ones ("hisab", "office", "room") are ignored.
 */
export const PAYMENT_APP_TAG_CATEGORY: [RegExp, string][] = [
  [/^self transfer$/, "transfer"],
  [/\b(food|panipuri|juice|snacks?|tea|coffee)\b/, "food"],
  [/\b(grocery|groceries|fruits?|vegetables?|milk)\b/, "groceries"],
  [/\b(rapido|taxi|cab|auto|metro|fuel|petrol)\b/, "transport"],
  [/\b(travel|flight|train|hotel)\b/, "travel"],
  [/\b(shopping|clothes)\b/, "shopping"],
  [/\b(medical|medicine|doctor|pharmacy)\b/, "health"],
  [/\b(education|course|books?)\b/, "education"],
  [/\b(swimming|gym|sports?)\b/, "fitness"],
  [/\b(drinks|party|movie)\b/, "entertainment"],
  [/\b(gas|electricity|ro water|water)\b/, "bills"],
  [/\b(investment|fd|sip)\b/, "invest-in"],
  [/^cash$/, "cash"],
];

export function categoryForTags(tags: string[]): { key: string; tag: string } | undefined {
  for (const tag of tags) {
    const t = tag.toLowerCase().trim();
    const hit = PAYMENT_APP_TAG_CATEGORY.find(([re]) => re.test(t));
    if (hit) return { key: hit[1], tag };
  }
  return undefined;
}

/** Built-in rules in the shape stored in the database (priority 100+, regex, editable). */
export function systemRuleRecords(categoryIdByKey: Record<string, string>) {
  return SYSTEM_RULES.map((r, i) => ({
    name: r.name,
    field: "DESCRIPTION" as const,
    matchType: "REGEX" as const,
    pattern: r.pattern,
    direction: r.direction ?? null,
    categoryId: categoryIdByKey[r.categoryKey],
    merchantName: r.merchantName ?? null,
    priority: 100 + i,
    isSystem: true,
    enabled: true,
    confidence: r.confidence ?? 0.9,
  }));
}
