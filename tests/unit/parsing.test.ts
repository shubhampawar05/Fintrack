import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseStatement, sniffFileKind, ParseError } from "@/lib/parsing";
import { parseTabular } from "@/lib/parsing";
import { kotakAdapter } from "@/lib/parsing/pdf/adapters";
import { parseColumnarPdf } from "@/lib/parsing/pdf/columnar";
import type { PdfLine } from "@/lib/parsing/pdf/extract";
import { sumPaise } from "@/lib/money";
import { BOM_ROWS, FEDERAL_ROWS, KOTAK_OPENING, KOTAK_ROWS } from "../fixtures/generate-fixtures";

const dir = path.join(__dirname, "../fixtures/statements");
const load = (f: string) => new Uint8Array(readFileSync(path.join(dir, f)));
const parse = (f: string) => parseStatement({ bytes: load(f), fileName: f });

/** Independent expectation: totals computed directly from the fixture definitions. */
function expectedTotals(rows: { amt: number; dir: "D" | "C" }[]) {
  return {
    debit: rows.filter((r) => r.dir === "D").reduce((s, r) => s + r.amt, 0),
    credit: rows.filter((r) => r.dir === "C").reduce((s, r) => s + r.amt, 0),
  };
}

function actualTotals(rows: { direction: string | null; amountPaise: number | null }[]) {
  return {
    debit: sumPaise(rows.filter((r) => r.direction === "DEBIT").map((r) => r.amountPaise!)),
    credit: sumPaise(rows.filter((r) => r.direction === "CREDIT").map((r) => r.amountPaise!)),
  };
}

describe("Kotak PDF adapter", () => {
  it("extracts every row, reconciles balances and matches independent totals", async () => {
    const r = await parse("kotak-synthetic.pdf");
    expect(r.parserId).toBe("kotak-pdf");
    expect(r.rows).toHaveLength(KOTAK_ROWS.length);
    expect(r.balanceCheck).toMatchObject({ status: "PASSED", mismatches: [] });
    expect(r.meta.openingBalancePaise).toBe(KOTAK_OPENING);
    expect(r.meta.accountNumber).toBe("1111222233");
    expect(r.meta.holderName).toBe("Asha Verma");
    expect(actualTotals(r.rows)).toEqual(expectedTotals(KOTAK_ROWS));
    expect(r.rows.every((x) => x.errors.length === 0)).toBe(true);
  });

  it("joins wrapped descriptions and keeps references, across a page break", async () => {
    const r = await parse("kotak-synthetic.pdf");
    expect(r.rows[0].description).toBe("NEFT-ACMEN12026010100001-ACME TECHNOLOGIES PVT LTD SALARY JAN");
    expect(r.rows[2].description).toBe("UPI/RAMESH KUMAR/HDFC/600000000002/Rent Jan");
    expect(r.rows[2].reference).toBe("UPI-600000000002");
    expect(r.rows[10]).toMatchObject({ txnDate: "2026-02-20", direction: "CREDIT", amountPaise: 15_000_00 });
    expect(r.rows[16].description).not.toMatch(/Account Summary|End of Statement/);
  });
});

describe("columnar engine", () => {
  const line = (page: number, y: number, cells: [number, string][]): PdfLine => ({
    page, y, text: cells.map((c) => c[1]).join(" "), items: cells.map(([x, str]) => ({ x, xEnd: x + str.length * 4, str })),
  });
  it("does not attach the next page's banner to the last row's wrapped narration", () => {
    const lines = [
      line(1, 700, [[39, "#"], [73, "Date"], [119, "Description"], [275, "Chq/Ref. No."], [360, "Withdrawal (Dr.)"], [440, "Deposit (Cr.)"], [520, "Balance"]]),
      line(1, 680, [[39, "1"], [73, "06 Oct 2026"], [119, "UPI/SYNTHETIC"], [275, "UPI-1"], [380, "15,000.00"], [529, "5,853.00"]]),
      line(1, 672, [[119, "PERSON/FDRL/600000000001/Monthly expe"]]),
      line(2, 821, [[36, "SYNTHETIC HOLDER"]]),
      line(2, 809, [[36, "Account No."], [84, "0000000000"]]),
    ];
    const { rows } = parseColumnarPdf(lines, kotakAdapter.config);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("UPI/SYNTHETIC PERSON/FDRL/600000000001/Monthly expe");
  });
});

describe("Federal Bank PDF adapter", () => {
  it("parses rows, value dates, Dr/Cr balances and bank-reported totals", async () => {
    const r = await parse("federal-synthetic.pdf");
    expect(r.parserId).toBe("federal-pdf");
    expect(r.rows).toHaveLength(FEDERAL_ROWS.length);
    expect(r.balanceCheck.status).toBe("PASSED");
    expect(r.warnings).toEqual([]);
    expect(actualTotals(r.rows)).toEqual(expectedTotals(FEDERAL_ROWS));
    expect(r.meta.holderMobile).toBe("9800000000");
    expect(r.rows[1]).toMatchObject({
      txnDate: "2026-01-04",
      valueDate: "2026-01-04",
      description: "UPIOUT/600000000020/swiggy.payu@hdfcbank/Food/5812",
      reference: "S10000002",
      amountPaise: 1_250_50,
      direction: "DEBIT",
    });
  });
});

describe("Bank of Maharashtra PDF adapter", () => {
  it("attaches description lines printed above and below the row", async () => {
    const r = await parse("bom-synthetic.pdf");
    expect(r.parserId).toBe("bom-pdf");
    expect(r.rows).toHaveLength(BOM_ROWS.length);
    expect(r.balanceCheck.status).toBe("PASSED");
    expect(r.warnings).toEqual([]);
    expect(actualTotals(r.rows)).toEqual(expectedTotals(BOM_ROWS));
    expect(r.rows[0].description).toBe("UPI 600000000040/KKBK/ASHA VERMA/Invest");
    expect(r.rows[2].description).toBe("NEFT KKBKN62026012000001 SPANDANA SPHOORTY FINA KKBK0000958");
    expect(r.rows[4]).toMatchObject({ description: "GST", amountPaise: 75, direction: "DEBIT" });
  });
});

describe("scanned PDFs", () => {
  it("are reported as needing OCR instead of producing data", async () => {
    const r = await parse("scanned-image.pdf");
    expect(r.needsOcr).toBe(true);
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]).toMatch(/OCR/);
  });
});

describe("CSV / XLSX", () => {
  it("detects the header row, merges wrapped narration and flags invalid dates", async () => {
    const r = await parse("generic-bank.csv");
    expect(r.fileType).toBe("CSV");
    expect(r.table?.headerRowIndex).toBe(2);
    expect(r.rows).toHaveLength(6);
    expect(r.rows[2].description).toBe("POS 512345XXXXXX1234 AMAZON PAY INDIA PRIVATE LIMITED BANGALORE");
    expect(r.rows[1]).toMatchObject({ direction: "CREDIT", amountPaise: 1_00_000_00 });
    expect(r.rows[5].errors).toContain("Missing or invalid transaction date");
    expect(r.balanceCheck.status).toBe("PASSED");
  });

  it("parses XLSX with preamble rows", async () => {
    const r = await parse("generic-bank.xlsx");
    expect(r.rows.map((x) => [x.txnDate, x.direction, x.amountPaise])).toEqual([
      ["2026-01-01", "DEBIT", 520_00],
      ["2026-01-05", "CREDIT", 50_000_00],
      ["2026-01-10", "DEBIT", 3_000_00],
    ]);
  });

  it("supports a single signed amount column and a Dr/Cr column via manual mapping", () => {
    const grid = [
      ["Posted", "Details", "Amt", "Type"],
      ["01/02/2026", "Coffee", "120.00", "DR"],
      ["02/02/2026", "Salary", "5,000.00", "CR"],
    ];
    const r = parseTabular("CSV", grid, { date: 0, description: 1, amount: 2, drCr: 3 });
    expect(r.rows.map((x) => [x.direction, x.amountPaise])).toEqual([
      ["DEBIT", 120_00],
      ["CREDIT", 5_000_00],
    ]);
    const signed = parseTabular("CSV", [["Date", "Description", "Amount"], ["01/02/2026", "Coffee", "-120"], ["02/02/2026", "Refund", "50"]]);
    expect(signed.rows.map((x) => x.direction)).toEqual(["DEBIT", "CREDIT"]);
  });

  it("reports missing mappings instead of guessing", () => {
    const r = parseTabular("CSV", [["Foo", "Bar"], ["1", "2"]]);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.rows).toHaveLength(0);
  });
});

describe("file validation", () => {
  it("identifies files by content, not extension", () => {
    expect(sniffFileKind(new TextEncoder().encode("%PDF-1.7 ..."), "x.pdf")).toBe("PDF");
    expect(sniffFileKind(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), "statement.pdf")).toBeNull();
    expect(sniffFileKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "statement.csv")).toBeNull();
    expect(sniffFileKind(new Uint8Array([0x00, 0x01, 0x02]), "statement.csv")).toBeNull();
    expect(sniffFileKind(new TextEncoder().encode("Date,Amount\n"), "s.csv")).toBe("CSV");
  });

  it("rejects unsupported and empty files", async () => {
    await expect(parseStatement({ bytes: new Uint8Array(), fileName: "a.pdf" })).rejects.toBeInstanceOf(ParseError);
    await expect(parseStatement({ bytes: new Uint8Array([1, 2, 3, 4]), fileName: "a.exe" })).rejects.toThrow(/Unsupported/);
  });
});
