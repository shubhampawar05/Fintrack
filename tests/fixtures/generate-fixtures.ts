/**
 * Generates SYNTHETIC statement fixtures that mimic the layouts of Kotak, Federal Bank and
 * Bank of Maharashtra PDFs plus generic CSV/XLSX exports. No real data is used.
 *   npx tsx tests/fixtures/generate-fixtures.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import * as XLSX from "xlsx";

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "statements");
mkdirSync(OUT, { recursive: true });

type Cell = { x: number; text: string; right?: boolean };
type Line = { y: number; cells: Cell[] };

function draw(page: PDFPage, font: PDFFont, lines: Line[], size = 7.5) {
  for (const line of lines) {
    for (const c of line.cells) {
      const w = font.widthOfTextAtSize(c.text, size);
      page.drawText(c.text, { x: c.right ? c.x - w : c.x, y: line.y, size, font, color: rgb(0, 0, 0) });
    }
  }
}

const inr = (paise: number) => {
  const s = (Math.abs(paise) / 100).toFixed(2);
  const [i, d] = s.split(".");
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest ? `${rest},` : ""}${last3}.${d}`;
};
const plain = (paise: number) => (Math.abs(paise) / 100).toFixed(2);

// ---------------------------------------------------------------- Kotak
interface KRow { date: string; desc: string[]; ref: string; amt: number; dir: "D" | "C" }
export const KOTAK_ROWS: KRow[] = [
  { date: "01 Jan 2026", desc: ["NEFT-ACMEN12026010100001-ACME", "TECHNOLOGIES PVT LTD SALARY JAN"], ref: "NEFT-ACME0001", amt: 85_000_00, dir: "C" },
  { date: "03 Jan 2026", desc: ["UPI/ASHA VERMA/FDRL/600000000001/Move", "to Federal"], ref: "UPI-600000000001", amt: 20_000_00, dir: "D" },
  { date: "05 Jan 2026", desc: ["UPI/RAMESH KUMAR/HDFC/600000000002/Rent", "Jan"], ref: "UPI-600000000002", amt: 18_000_00, dir: "D" },
  { date: "10 Jan 2026", desc: ["UPI/BLINKIT/YESB/600000000003/Order"], ref: "UPI-600000000003", amt: 450_00, dir: "D" },
  { date: "10 Jan 2026", desc: ["UPI/BLINKIT/YESB/600000000004/Order"], ref: "UPI-600000000004", amt: 450_00, dir: "D" },
  { date: "12 Jan 2026", desc: ["UPI/NETFLIX COM/HDFC/600000000005/Monthly"], ref: "UPI-600000000005", amt: 649_00, dir: "D" },
  { date: "15 Jan 2026", desc: ["UPI/SUNITA VERMA/SBIN/600000000006/Sent", "using P"], ref: "UPI-600000000006", amt: 5_000_00, dir: "D" },
  { date: "01 Feb 2026", desc: ["NEFT-ACMEN12026020100001-ACME", "TECHNOLOGIES PVT LTD SALARY FEB"], ref: "NEFT-ACME0002", amt: 85_000_00, dir: "C" },
  { date: "05 Feb 2026", desc: ["UPI/RAMESH KUMAR/HDFC/600000000007/Rent", "Feb"], ref: "UPI-600000000007", amt: 18_000_00, dir: "D" },
  { date: "12 Feb 2026", desc: ["UPI/NETFLIX COM/HDFC/600000000008/Monthly"], ref: "UPI-600000000008", amt: 649_00, dir: "D" },
  { date: "20 Feb 2026", desc: ["UPI/ASHA VERMA/FDRL/600000000031/Back"], ref: "UPI-600000000031", amt: 15_000_00, dir: "C" },
  { date: "01 Mar 2026", desc: ["NEFT-ACMEN12026030100001-ACME", "TECHNOLOGIES PVT LTD SALARY MAR"], ref: "NEFT-ACME0003", amt: 85_000_00, dir: "C" },
  { date: "05 Mar 2026", desc: ["UPI/RAMESH KUMAR/HDFC/600000000009/Rent", "Mar"], ref: "UPI-600000000009", amt: 18_000_00, dir: "D" },
  { date: "12 Mar 2026", desc: ["UPI/NETFLIX COM/HDFC/600000000010/Monthly"], ref: "UPI-600000000010", amt: 649_00, dir: "D" },
  { date: "20 Mar 2026", desc: ["ATW-512345XXXXXX1234-KOTAK ATM CASH"], ref: "ATW-0001", amt: 2_000_00, dir: "D" },
  { date: "25 Mar 2026", desc: ["UPI/BLINKIT/YESB/600000000011/Refund"], ref: "UPI-600000000011", amt: 450_00, dir: "C" },
  { date: "28 Mar 2026", desc: ["UPI/RAVI KUMAR/ICIC/600000000012/Sent", "using P"], ref: "UPI-600000000012", amt: 3_000_00, dir: "D" },
];
export const KOTAK_OPENING = 50_000_00;

async function kotak() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const header: Line = {
    y: 471,
    cells: [
      { x: 44, text: "#" }, { x: 75, text: "Date" }, { x: 124, text: "Description" }, { x: 280, text: "Chq/Ref. No." },
      { x: 355, text: "Withdrawal (Dr.)" }, { x: 429, text: "Deposit (Cr.)" }, { x: 498, text: "Balance" },
    ],
  };
  const banner = (n: number): Line[] => [
    { y: 800, cells: [{ x: 36, text: "Account Statement" }] },
    { y: 788, cells: [{ x: 36, text: "01 Jan 2026 - 31 Mar 2026" }] },
    { y: 760, cells: [{ x: 38, text: "Asha Verma" }, { x: 348, text: "Account No." }, { x: 395, text: "1111222233" }] },
    { y: 748, cells: [{ x: 38, text: "CRN xxxxxx123" }, { x: 348, text: "Account Type" }, { x: 402, text: "Savings" }] },
    { y: 700, cells: [{ x: 38, text: "MICR" }, { x: 106, text: "IFSC Code" }, { x: 146, text: "KKBK0000001" }] },
    { y: 20, cells: [{ x: 36, text: "Statement Generated on 01 Apr 2026, 10:00" }, { x: 519, text: `Page ${n} of 2` }] },
  ];
  const pages = [doc.addPage([595, 842]), doc.addPage([595, 842])];
  let bal = KOTAK_OPENING;
  const lines: Line[][] = [[...banner(1), header, { y: 455, cells: [{ x: 39, text: "-" }, { x: 119, text: "Opening Balance" }, { x: 556, text: inr(KOTAK_OPENING), right: true }] }], [...banner(2), header]];
  let y = 435;
  let p = 0;
  KOTAK_ROWS.forEach((r, i) => {
    if (i === 10) {
      p = 1;
      y = 435;
    }
    bal += r.dir === "C" ? r.amt : -r.amt;
    lines[p].push({
      y,
      cells: [
        { x: 39, text: String(i + 1) }, { x: 74, text: r.date }, { x: 119, text: r.desc[0] }, { x: 275, text: r.ref },
        { x: r.dir === "D" ? 418 : 487, text: inr(r.amt), right: true }, { x: 556, text: inr(bal), right: true },
      ],
    });
    r.desc.slice(1).forEach((d, k) => lines[p].push({ y: y - 9 * (k + 1), cells: [{ x: 119, text: d }] }));
    y -= 21 + 9 * (r.desc.length - 1);
  });
  lines[1].push({ y: y - 30, cells: [{ x: 251, text: "Account Summary" }] });
  lines[1].push({ y: y - 45, cells: [{ x: 53, text: "Particulars" }, { x: 286, text: "Opening Balance" }, { x: 428, text: "Closing Balance" }] });
  lines[1].push({ y: y - 58, cells: [{ x: 44, text: "Savings Account (SA):" }, { x: 356, text: inr(KOTAK_OPENING) }, { x: 502, text: inr(bal) }] });
  lines[1].push({ y: y - 75, cells: [{ x: 253, text: "End of Statement" }] });
  pages.forEach((pg, i) => draw(pg, font, lines[i]));
  writeFileSync(path.join(OUT, "kotak-synthetic.pdf"), await doc.save());
  return bal;
}

// ---------------------------------------------------------------- Federal
interface FRow { date: string; desc: string[]; type: string; id: string; amt: number; dir: "D" | "C" }
export const FEDERAL_ROWS: FRow[] = [
  { date: "03-JAN-2026", desc: ["UPI IN/600000000001", "/9800000000@ptyes/Move to/0000"], type: "TFR", id: "S10000001", amt: 20_000_00, dir: "C" },
  { date: "04-JAN-2026", desc: ["UPIOUT/600000000020/swiggy.", "payu@hdfcbank/Food/5812"], type: "TFR", id: "S10000002", amt: 1_250_50, dir: "D" },
  { date: "06-JAN-2026", desc: ["UPIOUT/600000000021/cred.", "club@axisb/payment /5413"], type: "TFR", id: "S10000003", amt: 5_000_00, dir: "D" },
  { date: "07-JAN-2026", desc: ["UPIOUT/600000000022", "/groww.rzp@axisbank/SIP/6211"], type: "TFR", id: "S10000004", amt: 10_000_00, dir: "D" },
  { date: "08-JAN-2026", desc: ["UPIOUT/600000000023", "/jiorecharge@sbi/Recharge/4814"], type: "TFR", id: "S10000005", amt: 799_00, dir: "D" },
  { date: "09-JAN-2026", desc: ["UPIOUT/600000000024", "/paytmqr12345@paytm/Sent /5411"], type: "TFR", id: "S10000006", amt: 300_00, dir: "D" },
  { date: "09-JAN-2026", desc: ["UPI REFUND RRC 600000000024"], type: "TFR", id: "S10000007", amt: 300_00, dir: "C" },
  { date: "15-FEB-2026", desc: ["UPIOUT/600000000030", "/friend123@okaxis/Loan/0000"], type: "TFR", id: "S10000008", amt: 2_000_00, dir: "D" },
  { date: "20-FEB-2026", desc: ["UPIOUT/600000000031", "/9800000000@ptyes/Back/0000"], type: "TFR", id: "S10000009", amt: 15_000_00, dir: "D" },
  { date: "28-MAR-2026", desc: ["SBINT:27-12-2025 to 27-03-2026", "[99990000123456]"], type: "TFR", id: "S10000010", amt: 42_00, dir: "C" },
  { date: "30-MAR-2026", desc: ["CHRG/NACH RETURN/24-03-2026/1GROWW", "INVEST TECH PR"], type: "TFR", id: "S10000011", amt: 590_00, dir: "D" },
];
export const FEDERAL_OPENING = 20_000_00;
/** Second, overlapping statement (Mar–Apr) for duplicate-detection tests. */
export const FEDERAL_ROWS_2: FRow[] = [
  ...FEDERAL_ROWS.slice(9),
  { date: "05-APR-2026", desc: ["UPIOUT/600000000032", "/swiggy.payu@hdfcbank/Food/5812"], type: "TFR", id: "S10000012", amt: 640_00, dir: "D" },
  { date: "05-APR-2026", desc: ["UPIOUT/600000000032", "/swiggy.payu@hdfcbank/Food/5812"], type: "TFR", id: "S10000013", amt: 640_00, dir: "D" },
];

async function federal(rows: FRow[], opening: number, period: [string, string], file: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const lines: Line[] = [
    { y: 800, cells: [{ x: 18, text: "Name" }, { x: 161, text: ": ASHA VERMA" }, { x: 304, text: "Branch Name" }, { x: 446, text: ": Kochi" }] },
    { y: 788, cells: [{ x: 18, text: "Regd. Mobile Number" }, { x: 161, text: ": 919800000000" }, { x: 304, text: "Account Number" }, { x: 446, text: ": 99990000123456" }] },
    { y: 776, cells: [{ x: 18, text: "IFSC" }, { x: 161, text: ": FDRL0000001" }, { x: 304, text: "Date of Issue" }, { x: 446, text: ": 01/05/2026" }] },
    { y: 494, cells: [{ x: 140, text: `Statement of Account for the period ${period[0]} to ${period[1]}` }] },
    { y: 467, cells: [{ x: 266, text: "Tran" }, { x: 373, text: "Cheque" }, { x: 563, text: "DR" }] },
    { y: 463, cells: [{ x: 33, text: "Date" }, { x: 79, text: "Value Date" }, { x: 173, text: "Particulars" }, { x: 311, text: "Tran ID" }, { x: 419, text: "Withdrawals" }, { x: 474, text: "Deposits" }, { x: 518, text: "Balance" }] },
    { y: 459, cells: [{ x: 266, text: "Type" }, { x: 374, text: "Details" }, { x: 562, text: "/CR" }] },
    { y: 442, cells: [{ x: 129, text: "Opening Balance" }, { x: 549, text: plain(opening), right: true }, { x: 572, text: "Cr" }] },
    { y: 30, cells: [{ x: 134, text: "The Federal Bank Ltd. Corporate Office: Federal Towers, Aluva, Kerala" }, { x: 544, text: "Page 1 of 1" }] },
  ];
  let bal = opening;
  let y = 425;
  let dr = 0;
  let cr = 0;
  for (const r of rows) {
    bal += r.dir === "C" ? r.amt : -r.amt;
    if (r.dir === "C") cr += r.amt;
    else dr += r.amt;
    lines.push({
      y,
      cells: [
        { x: 22, text: r.date }, { x: 79, text: r.date }, { x: 129, text: r.desc[0] }, { x: 273, text: r.type }, { x: 318, text: r.id },
        { x: r.dir === "D" ? 461 : 505, text: plain(r.amt), right: true }, { x: 549, text: plain(bal), right: true }, { x: 572, text: "Cr" },
      ],
    });
    r.desc.slice(1).forEach((d, k) => lines.push({ y: y - 8.5 * (k + 1), cells: [{ x: 129, text: d }] }));
    y -= 25;
  }
  lines.push({ y: y - 5, cells: [{ x: 199, text: "GRAND TOTAL" }, { x: 461, text: plain(dr), right: true }, { x: 505, text: plain(cr), right: true }] });
  lines.push({ y: y - 20, cells: [{ x: 251, text: "****END OF STATEMENT****" }] });
  draw(page, font, lines);
  writeFileSync(path.join(OUT, file), await doc.save());
  return bal;
}

// ---------------------------------------------------------------- Bank of Maharashtra
interface BRow { date: string; above: string; inline?: string; below?: string; ref?: string; amt: number; dir: "D" | "C"; channel: string[] }
export const BOM_ROWS: BRow[] = [
  { date: "05/01/2026", above: "UPI 600000000040/KKBK/ASHA VERMA", below: "/Invest", ref: "600000000040", amt: 10_000_00, dir: "C", channel: ["UPI"] },
  { date: "10/01/2026", above: "UPI 600000000041/HDFC/MUTUAL FUNDS ICCL", below: "/Paid Via E", ref: "600000000041", amt: 5_000_00, dir: "D", channel: ["UPI"] },
  { date: "20/01/2026", above: "NEFT KKBKN62026012000001 SPANDANA", below: "SPHOORTY FINA KKBK0000958", amt: 83_22, dir: "C", channel: ["9008-NEFT/", "RTGS CELL"] },
  { date: "30/01/2026", above: "", inline: "MONTHLY SMS CHA", amt: 4_20, dir: "D", channel: ["9999-", "CENTRAL"] },
  { date: "30/01/2026", above: "", inline: "GST", amt: 75, dir: "D", channel: ["9999-", "CENTRAL"] },
  { date: "05/02/2026", above: "", inline: "UPI 600000000050/AIRP/Asha Verma/NA", ref: "600000000050", amt: 24_500_00, dir: "D", channel: ["UPI"] },
  { date: "05/02/2026", above: "", inline: "UPIR 600000000050UPIDEBITREV", amt: 24_500_00, dir: "C", channel: ["UPI"] },
];
export const BOM_OPENING = 20_000_00;

async function bom() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const lines: Line[] = [
    { y: 700, cells: [{ x: 15, text: "Account Holder Names" }, { x: 149, text: "Ms. ASHA VERMA" }, { x: 428, text: "Primary GSTIN" }, { x: 533, text: "NA" }] },
    { y: 680, cells: [{ x: 15, text: "Branch No" }, { x: 64, text: "00001" }, { x: 389, text: "IFSC" }, { x: 442, text: "MAHB0000001" }] },
    { y: 660, cells: [{ x: 14, text: "A. Statement for Account No" }, { x: 166, text: "60000000001" }, { x: 235, text: "from" }, { x: 263, text: "01/01/2026" }, { x: 321, text: "to" }, { x: 334, text: "31/03/2026" }] },
    { y: 613, cells: [{ x: 291, text: "Cheque" }] },
    { y: 608, cells: [{ x: 19, text: "Sr No" }, { x: 64, text: "Date" }, { x: 170, text: "Particulars" }, { x: 352, text: "Debit" }, { x: 409, text: "Credit" }, { x: 479, text: "Balance" }, { x: 544, text: "Channel" }] },
    { y: 604, cells: [{ x: 281, text: "/Reference No" }] },
  ];
  let bal = BOM_OPENING;
  let y = 586;
  let dr = 0;
  let cr = 0;
  BOM_ROWS.forEach((r, i) => {
    bal += r.dir === "C" ? r.amt : -r.amt;
    if (r.dir === "C") cr += r.amt;
    else dr += r.amt;
    if (r.above) lines.push({ y: y + 4, cells: [{ x: 103, text: r.above }] });
    lines.push({
      y,
      cells: [
        { x: 27, text: String(i + 1) }, { x: 55, text: r.date },
        ...(r.inline ? [{ x: 103, text: r.inline }] : []),
        ...(r.ref ? [{ x: 276, text: r.ref }] : []),
        { x: r.dir === "D" ? 388 : 446, text: inr(r.amt), right: true }, { x: 533, text: inr(bal), right: true },
        { x: 552, text: r.channel[0] },
      ],
    });
    if (r.below) lines.push({ y: y - 4, cells: [{ x: 103, text: r.below }] });
    if (r.channel[1]) lines.push({ y: y - 3, cells: [{ x: 540, text: r.channel[1] }] });
    y -= 20;
  });
  lines.push({ y: y - 30, cells: [{ x: 14, text: "B. Summary for Account No" }, { x: 164, text: "60000000001" }] });
  lines.push({ y: y - 55, cells: [{ x: 15, text: "Total Transaction Count" }, { x: 247, text: String(BOM_ROWS.length) }, { x: 276, text: "Opening Balance" }, { x: 475, text: inr(BOM_OPENING) }] });
  lines.push({ y: y - 72, cells: [{ x: 15, text: "Total Debit Count" }, { x: 276, text: "Total Debit Amount" }, { x: 475, text: inr(dr) }] });
  lines.push({ y: y - 89, cells: [{ x: 15, text: "Total Credit Count" }, { x: 276, text: "Total Credit Amount" }, { x: 475, text: inr(cr) }] });
  lines.push({ y: y - 106, cells: [{ x: 276, text: "Closing Balance" }, { x: 475, text: inr(bal) }] });
  lines.push({ y: y - 130, cells: [{ x: 14, text: "* END OF STATEMENT" }] });
  lines.push({ y: 15, cells: [{ x: 272, text: "Page 1 of 1" }] });
  lines.push({ y: 820, cells: [{ x: 200, text: "www.bankofmaharashtra.in mahabank" }] });
  draw(page, font, lines);
  writeFileSync(path.join(OUT, "bom-synthetic.pdf"), await doc.save());
  return bal;
}

async function scanned() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 50, y: 50, width: 495, height: 742, color: rgb(0.9, 0.9, 0.9) });
  writeFileSync(path.join(OUT, "scanned-image.pdf"), await doc.save());
}

function csv() {
  const rows = [
    ["SYNTHETIC BANK Ltd. Statement of accounts", "", "", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
    ["01/01/26", "UPI-ZOMATO-zomato@hdfcbank-HDFC0000001-600000000060-Dinner", "0000600000000060", "01/01/26", "1,240.00", "", "48,760.00"],
    ["02/01/26", "NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY", "N002260000000001", "02/01/26", "", "1,00,000.00", "1,48,760.00"],
    ["03/01/26", "POS 512345XXXXXX1234 AMAZON PAY INDIA", "0000000000000003", "03/01/26", "2,999.00", "", "1,45,761.00"],
    ["", "PRIVATE LIMITED BANGALORE", "", "", "", "", ""],
    ["03/01/26", "UPI-ZOMATO-zomato@hdfcbank-HDFC0000001-600000000061-Lunch", "0000600000000061", "03/01/26", "240.00", "", "1,45,521.00"],
    ["03/01/26", "UPI-ZOMATO-zomato@hdfcbank-HDFC0000001-600000000062-Lunch", "0000600000000062", "03/01/26", "240.00", "", "1,45,281.00"],
    ["31/13/26", "ROW WITH AN INVALID DATE", "", "not-a-date", "100.00", "", "1,45,181.00"],
    ["", "", "", "", "", "", ""],
    ["STATEMENT SUMMARY :-", "", "", "", "", "", ""],
  ];
  writeFileSync(
    path.join(OUT, "generic-bank.csv"),
    rows.map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n"),
  );
}

function xlsx() {
  const aoa = [
    ["Account Name", ":", "Asha Verma"],
    ["Account Number", ":", "00000012345"],
    [],
    ["Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"],
    ["1 Jan 2026", "1 Jan 2026", "TO TRANSFER-UPI/DR/600000000070/SWIGGY/YESB/swiggy@ybl", "600000000070", 520.0, "", 9480.0],
    ["5 Jan 2026", "5 Jan 2026", "BY TRANSFER-NEFT*ACME TECH*SALARY", "NEFT0001", "", 50000.0, 59480.0],
    ["10 Jan 2026", "10 Jan 2026", "ATM WDL-ATM CASH 1234 MUMBAI", "ATM0001", 3000.0, "", 56480.0],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Statement");
  writeFileSync(path.join(OUT, "generic-bank.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ---------------------------------------------------------------- Paytm UPI statement
// Card-per-payment layout; UPI refs line up with the synthetic Federal statement above.
interface PEntry { date: string; time: string; lead: string[]; upi?: string[]; ref: string; refLabel?: string; note?: string; tags: string[]; account: [string, string]; amount: string }
export const PAYTM_ENTRIES: PEntry[] = [
  { date: "30 Mar", time: "9:10 AM", lead: ["Paid to Tea Stall"], upi: ["paytmqr000001@paytm on"], ref: "600000000099", note: "Chai", tags: ["# Food"], account: ["CSB Bank", "Rupay Credit Card - 55"], amount: "- Rs.20" },
  { date: "20 Feb", time: "6:00 PM", lead: ["Transferred to Self, Kotak Mahindra", "Bank - 2233"], upi: ["9800000000@ptyes on"], ref: "600000000031", note: "Back", tags: ["# Self Transfer"], account: ["Fi (Federal", "Bank) - 56"], amount: "Rs.15,000" },
  { date: "15 Feb", time: "8:45 PM", lead: ["Paid to Priya Nair"], upi: ["UPI ID: friend123@oka", "xis on"], ref: "600000000030", note: "Movie night", tags: ["#drinks"], account: ["Fi (Federal", "Bank) - 56"], amount: "- Rs.2,000" },
  { date: "03 Jan", time: "10:00 AM", lead: ["Received from Asha Verma"], upi: ["asha@okicici on"], ref: "600000000001", tags: ["# Money Received"], account: ["Fi (Federal", "Bank) - 56"], amount: "+ Rs.20,000" },
  { date: "01 Jan", time: "7:00 AM", lead: ["Gold Coin Redemption"], ref: "15200000001", refLabel: "Bank Ref No", tags: ["# Investment"], account: ["Gold Coins", ""], amount: "- Rs.5" },
];

async function paytm() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage([595, 842]);
  draw(first, font, [
    { y: 816, cells: [{ x: 464, text: "ASHA VERMA" }] },
    { y: 762, cells: [{ x: 70, text: "Paytm Statement for" }, { x: 259, text: "Total Money Paid" }, { x: 429, text: "Total Money Received" }] },
    { y: 743, cells: [{ x: 57, text: "01 JAN'26 - 31 MAR'26" }, { x: 251, text: "- Rs.2,025" }, { x: 434, text: "+ Rs.20,000" }] },
    { y: 728, cells: [{ x: 248, text: "3 Payments made" }, { x: 426, text: "1 Payment received" }] },
    { y: 161, cells: [{ x: 15, text: "Passbook Payments History" }] },
    { y: 110, cells: [{ x: 90, text: "Transaction Details" }, { x: 288, text: "Notes & Tags" }, { x: 396, text: "Your Account" }, { x: 492, text: "Amount" }] },
    { y: 61, cells: [{ x: 9, text: "Page" }, { x: 34, text: "1" }, { x: 43, text: "of" }, { x: 54, text: "2" }] },
  ]);
  const page = doc.addPage([595, 842]);
  const lines: Line[] = [
    { y: 811, cells: [{ x: 15, text: "Passbook Payments History" }] },
    { y: 760, cells: [{ x: 23, text: "Date &" }, { x: 90, text: "Transaction Details" }, { x: 288, text: "Notes & Tags" }, { x: 396, text: "Your Account" }, { x: 492, text: "Amount" }] },
  ];
  let y = 713;
  for (const e of PAYTM_ENTRIES) {
    lines.push({ y, cells: [{ x: 23, text: e.date }, { x: 288, text: e.note ? `Note: ${e.note}` : "Tag:" }, { x: 492, text: e.amount }] });
    lines.push({ y: y - 2, cells: [{ x: 91, text: e.lead[0] }, { x: 414, text: e.account[0] }] });
    lines.push({ y: y - 13, cells: [{ x: 23, text: e.time }] });
    let yy = y - 16;
    for (const extra of e.lead.slice(1)) lines.push({ y: (yy -= 3), cells: [{ x: 91, text: extra }] });
    const upi = e.upi ? [e.upi[0].startsWith("UPI ID:") ? e.upi[0] : `UPI ID: ${e.upi[0]}`, ...e.upi.slice(1)] : [];
    const tagLines = e.note ? ["Tag:", ...e.tags] : e.tags;
    const details = [...upi, `${e.refLabel ?? "UPI Ref No"}: ${e.ref}`];
    const rows = Math.max(details.length, tagLines.length, 1);
    for (let i = 0; i < rows; i++) {
      yy -= 14;
      const cells: Cell[] = [];
      if (details[i]) cells.push({ x: 91, text: details[i] });
      if (tagLines[i]) cells.push({ x: tagLines[i] === "Tag:" ? 302 : 294, text: tagLines[i] });
      if (i === 0 && e.account[1]) cells.push({ x: 414, text: e.account[1] });
      lines.push({ y: yy, cells });
    }
    if (!e.amount.match(/^[-+]/)) lines.push({ y: (yy -= 20), cells: [{ x: 16, text: "Note: This payment is not included in the total money paid and money received calculations." }] });
    y = yy - 40;
  }
  lines.push({ y: 61, cells: [{ x: 9, text: "Page" }, { x: 34, text: "2" }, { x: 43, text: "of" }, { x: 54, text: "2" }] });
  draw(page, font, lines);
  writeFileSync(path.join(OUT, "paytm-synthetic.pdf"), await doc.save());
}

async function main() {
  const k = await kotak();
  const f = await federal(FEDERAL_ROWS, FEDERAL_OPENING, ["2026-01-01", "2026-03-31"], "federal-synthetic.pdf");
  const f2 = await federal(FEDERAL_ROWS_2, f + 590_00 - 42_00, ["2026-03-01", "2026-04-30"], "federal-synthetic-overlap.pdf");
  const b = await bom();
  await scanned();
  await paytm();
  csv();
  xlsx();
  console.log({ kotakClosing: k, federalClosing: f, federal2Closing: f2, bomClosing: b });
}

if (process.argv[1]?.endsWith("generate-fixtures.ts")) main();
