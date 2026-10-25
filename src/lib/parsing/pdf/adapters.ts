import { parseAmountToPaise } from "@/lib/money";
import { parseIndianDate } from "@/lib/dates";
import type { StatementMeta } from "../types";
import type { ColumnarConfig } from "./columnar";
import type { PdfDocumentText } from "./extract";

/**
 * Bank-specific PDF adapters. Each adapter knows how to recognise its bank's statement,
 * which table headings to look for, and how to read account metadata from the header.
 * The table itself is parsed by the shared columnar engine.
 */
export interface PdfAdapter {
  id: string;
  version: string;
  bankName: string;
  detect(doc: PdfDocumentText): boolean;
  config: ColumnarConfig;
  meta(doc: PdfDocumentText): StatementMeta;
}

function find(text: string, re: RegExp): string | undefined {
  return re.exec(text)?.[1]?.trim();
}

function amount(s: string | undefined) {
  if (!s) return undefined;
  return parseAmountToPaise(s) ?? undefined;
}

function date(s: string | undefined) {
  return s ? (parseIndianDate(s) ?? undefined) : undefined;
}

function lastAmountOnLine(doc: PdfDocumentText, re: RegExp): number | undefined {
  const line = doc.lines.find((l) => re.test(l.text));
  if (!line) return undefined;
  const amounts = line.items.filter((i) => /^-?[\d,]+\.\d{2}$/.test(i.str));
  const last = amounts[amounts.length - 1];
  if (!last) return undefined;
  const sign = line.items.some((i) => /^Dr\.?$/i.test(i.str)) ? -1 : 1;
  return amount(last.str)! * sign;
}

export const kotakAdapter: PdfAdapter = {
  id: "kotak-pdf",
  version: "1.0.0",
  bankName: "Kotak Mahindra Bank",
  detect: (doc) => /KKBK\d|kotak\.(bank\.)?in|Kotak/i.test(doc.fullText) && /Withdrawal \(Dr\.\)/.test(doc.fullText),
  config: {
    headers: {
      date: /^Date$/,
      description: /^Description$/,
      reference: /^Chq\/Ref\.? No\.?$/,
      debit: /^Withdrawal/,
      credit: /^Deposit/,
      balance: /^Balance$/,
    },
    rowDate: /^\d{2} [A-Za-z]{3} \d{4}$/,
    continuation: "below",
    stop: /^Account Summary$|^End of Statement$|Commonly Used Narrations|^Particulars Opening Balance Closing Balance/i,
    skip: /Opening Balance|Statement Generated on|Page \d+ of/,
    joinMode: "space",
  },
  meta(doc) {
    const t = doc.fullText;
    const period = /(\d{2} [A-Za-z]{3} \d{4}) - (\d{2} [A-Za-z]{3} \d{4})/.exec(t);
    // The holder's name is the first left-column line below the statement period.
    const periodIdx = doc.lines.findIndex((l) => l.page === 1 && /^\d{2} [A-Za-z]{3} \d{4} - \d{2} [A-Za-z]{3} \d{4}$/.test(l.text));
    const holderLine = doc.lines.slice(periodIdx + 1).find((l) => l.page === 1 && l.items[0]?.x < 100);
    return {
      bankName: this.bankName,
      accountNumber: find(t, /Account No\.\s+(\d{6,20})/),
      holderName: holderLine?.items[0]?.str,
      ifsc: find(t, /IFSC Code\s+([A-Z]{4}0[A-Z0-9]{6})/),
      periodStart: date(period?.[1]),
      periodEnd: date(period?.[2]),
      statementDate: date(find(t, /Statement Generated on (\d{2} [A-Za-z]{3} \d{4})/)),
      openingBalancePaise: lastAmountOnLine(doc, /Opening Balance/),
    };
  },
};

export const federalAdapter: PdfAdapter = {
  id: "federal-pdf",
  version: "1.0.0",
  bankName: "Federal Bank",
  detect: (doc) => /Federal Bank|FDRL0/i.test(doc.fullText) && /Withdrawals/.test(doc.fullText),
  config: {
    headers: {
      date: /^Date$/,
      valueDate: /^Value Date$/,
      description: /^Particulars$/,
      type: /^(Tran|Type)$/,
      reference: /^Tran ID$/,
      debit: /^Withdrawals$/,
      credit: /^Deposits$/,
      balance: /^Balance$/,
    },
    rowDate: /^\d{2}-[A-Z]{3}-\d{4}$/,
    continuation: "below",
    stop: /GRAND TOTAL|Abbreviations Used|END OF STATEMENT/,
    skip: /Opening Balance|Federal Bank Ltd|Page \d+ of \d+|Ph:\s*0484/,
    joinMode: "smart",
  },
  meta(doc) {
    const t = doc.fullText;
    const period = /for the period (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(t);
    const totals = doc.lines.find((l) => /GRAND TOTAL/.test(l.text));
    const totalAmounts = totals?.items.filter((i) => /^[\d,]+\.\d{2}$/.test(i.str)).map((i) => amount(i.str)) ?? [];
    const mobile = find(t, /Regd\. Mobile Number\s*:\s*(\d{10,12})/);
    return {
      bankName: this.bankName,
      accountNumber: find(t, /Account Number\s*:\s*(\d{6,20})/),
      holderName: find(t, /^Name\s*:\s*([A-Za-z .]+?)\s+Branch Name/m),
      holderMobile: mobile ? mobile.slice(-10) : undefined,
      ifsc: find(t, /IFSC\s*:\s*([A-Z]{4}0[A-Z0-9]{6})/),
      periodStart: period?.[1],
      periodEnd: period?.[2],
      statementDate: date(find(t, /Date of Issue\s*:\s*(\d{2}\/\d{2}\/\d{4})/)),
      openingBalancePaise: lastAmountOnLine(doc, /Opening Balance/),
      reportedDebitTotalPaise: totalAmounts.length === 2 ? totalAmounts[0] : undefined,
      reportedCreditTotalPaise: totalAmounts.length === 2 ? totalAmounts[1] : undefined,
    };
  },
};

export const bankOfMaharashtraAdapter: PdfAdapter = {
  id: "bom-pdf",
  version: "1.0.0",
  bankName: "Bank of Maharashtra",
  detect: (doc) => /mahabank|Bank of Maharashtra|MAHB0/i.test(doc.fullText),
  config: {
    headers: {
      date: /^Date$/,
      description: /^Particulars$/,
      reference: /^(Cheque|\/Reference No)$/,
      channel: /^Channel$/,
      debit: /^Debit$/,
      credit: /^Credit$/,
      balance: /^Balance$/,
    },
    rowDate: /^\d{2}\/\d{2}\/\d{4}$/,
    continuation: "nearest",
    maxContinuationGap: 10,
    stop: /Summary for Account No|END OF STATEMENT/,
    skip: /^Page \d+ of \d+$/,
    joinMode: "smart",
  },
  meta(doc) {
    const t = doc.fullText;
    const period = /Statement for Account No\s+(\d+)\s+from\s+(\d{2}\/\d{2}\/\d{4})\s+to\s+(\d{2}\/\d{2}\/\d{4})/.exec(t);
    const count = find(t, /Total Transaction Count\s+(\d+)/);
    const stmtDate = /Statement Date\s+\w{3} (\w{3}) (\d{1,2}) [\d:]+ \S+ (\d{4})/.exec(t);
    return {
      bankName: this.bankName,
      accountNumber: period?.[1] ?? find(t, /(\d{11})\s+\d{2}\/\d{2}\/\d{4}/),
      holderName: find(t, /Account Holder Names\s+(?:Mr\.|Ms\.|Mrs\.)?\s*([A-Z .]+?)\s+Primary GSTIN/),
      ifsc: find(t, /IFSC\s+(MAHB0\d{6})/),
      periodStart: date(period?.[2]),
      periodEnd: date(period?.[3]),
      statementDate: stmtDate ? date(`${stmtDate[2]} ${stmtDate[1]} ${stmtDate[3]}`) : undefined,
      openingBalancePaise: lastAmountOnLine(doc, /^Total Transaction Count.*Opening Balance/),
      closingBalancePaise: lastAmountOnLine(doc, /Closing Balance/),
      reportedDebitTotalPaise: lastAmountOnLine(doc, /Total Debit Amount/),
      reportedCreditTotalPaise: lastAmountOnLine(doc, /Total Credit Amount/),
      reportedCount: count ? Number(count) : undefined,
    };
  },
};

/** Fallback for unknown banks: common Indian statement headings. */
export const genericPdfAdapter: PdfAdapter = {
  id: "generic-pdf",
  version: "1.0.0",
  bankName: "Unknown bank",
  detect: () => true,
  config: {
    headers: {
      date: /^(Txn |Tran(saction)? |Post(ing)? )?Date$/i,
      valueDate: /^Value Date$/i,
      description: /^(Description|Particulars|Narration|Details|Remarks|Transaction Details)$/i,
      reference: /^(Chq|Cheque|Ref)/i,
      debit: /^(Withdrawal|Debit|Dr\.?)( Amount| Amt\.?)?( \(Dr\.?\)| \(INR\))?$/i,
      credit: /^(Deposit|Credit|Cr\.?)( Amount| Amt\.?)?( \(Cr\.?\)| \(INR\))?$/i,
      balance: /^(Closing |Running )?Balance( \(INR\))?$/i,
    },
    rowDate: /^(\d{1,2}[/-](\d{1,2}|[A-Za-z]{3})[/-]\d{2,4}|\d{1,2} [A-Za-z]{3} \d{2,4}|\d{4}-\d{2}-\d{2})$/,
    continuation: "below",
    stop: /GRAND TOTAL|Statement Summary|END OF STATEMENT/i,
    skip: /Opening Balance|Page \d+ of \d+/i,
    joinMode: "space",
  },
  meta(doc) {
    return { openingBalancePaise: lastAmountOnLine(doc, /Opening Balance/i) };
  },
};

export const PDF_ADAPTERS: PdfAdapter[] = [kotakAdapter, federalAdapter, bankOfMaharashtraAdapter];
