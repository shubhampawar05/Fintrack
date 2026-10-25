import Papa from "papaparse";
import * as XLSX from "xlsx";
import { extractPdfText } from "./pdf/extract";
import { parseColumnarPdf } from "./pdf/columnar";
import { PDF_ADAPTERS, genericPdfAdapter, type PdfAdapter } from "./pdf/adapters";
import { autoMap, detectHeaderRow, mappingErrors, rowsFromGrid } from "./tabular";
import { finalizeRows } from "./validate";
import { isPaytmStatement, parsePaytmStatement, PAYTM_PARSER, type PaytmParseResult } from "./paytm";
import { ParseError, type ColumnMapping, type ParseResult } from "./types";

export { ParseError } from "./types";
export type { ParseResult, ParsedRow, ColumnMapping } from "./types";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const TABULAR_PARSER_VERSION = "1.0.0";

export type FileKind = "PDF" | "CSV" | "XLSX";

/** Identify the file by its content (magic bytes), not by its name. */
export function sniffFileKind(bytes: Uint8Array, fileName: string): FileKind | null {
  const head = Array.from(bytes.slice(0, 8));
  const ascii = String.fromCharCode(...head);
  if (ascii.startsWith("%PDF-")) return "PDF";
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    return /\.(xlsx|xlsm)$/i.test(fileName) ? "XLSX" : null;
  }
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    return /\.xls$/i.test(fileName) ? "XLSX" : null;
  }
  if (/\.(csv|txt)$/i.test(fileName)) {
    // Must be text: reject binary content masquerading as CSV.
    const sample = bytes.slice(0, 4096);
    let control = 0;
    for (const b of sample) if (b === 0 || (b < 9 && b !== 0)) control++;
    if (control === 0) return "CSV";
  }
  return null;
}

export interface ParseInput {
  bytes: Uint8Array;
  fileName: string;
  password?: string;
  mapping?: ColumnMapping;
  adapterId?: string;
}

export async function parseStatement(input: ParseInput): Promise<ParseResult> {
  if (input.bytes.byteLength === 0) throw new ParseError("The file is empty.", "INVALID_FILE");
  if (input.bytes.byteLength > MAX_FILE_BYTES) throw new ParseError("The file is larger than 15 MB.", "INVALID_FILE");
  const kind = sniffFileKind(input.bytes, input.fileName);
  if (!kind) throw new ParseError("Unsupported file. Upload a PDF, CSV, XLS or XLSX bank statement.", "UNSUPPORTED");
  if (kind === "PDF") return parsePdf(input);
  return parseTabular(kind, readGrid(kind, input.bytes), input.mapping);
}

/** Parse a payment-app history (currently Paytm's UPI statement PDF). */
export async function parsePaymentAppStatement(input: { bytes: Uint8Array; fileName: string; password?: string }): Promise<PaytmParseResult & { parserId: string; parserVersion: string }> {
  if (input.bytes.byteLength === 0) throw new ParseError("The file is empty.", "INVALID_FILE");
  if (input.bytes.byteLength > MAX_FILE_BYTES) throw new ParseError("The file is larger than 15 MB.", "INVALID_FILE");
  if (sniffFileKind(input.bytes, input.fileName) !== "PDF") throw new ParseError("Upload the Paytm UPI statement PDF.", "UNSUPPORTED");
  const doc = await extractPdfText(input.bytes, input.password);
  if (!isPaytmStatement(doc)) {
    throw new ParseError("This doesn't look like a Paytm UPI statement. Bank statements go in the form above.", "UNSUPPORTED");
  }
  return { ...parsePaytmStatement(doc), parserId: PAYTM_PARSER.id, parserVersion: PAYTM_PARSER.version };
}

async function parsePdf(input: ParseInput): Promise<ParseResult> {
  const doc = await extractPdfText(input.bytes, input.password);
  const base = { fileType: "PDF" as const, warnings: [] as string[], errors: [] as string[] };
  if (doc.imageOnlyPages.length === doc.pageCount) {
    return {
      ...base,
      parserId: "none",
      parserVersion: "0",
      meta: {},
      rows: [],
      needsOcr: true,
      errors: [
        "This PDF contains no extractable text — it looks like a scanned image. OCR is required; please download a text-based (e-statement) PDF or a CSV/XLSX export from your bank instead.",
      ],
      balanceCheck: { status: "NOT_AVAILABLE", checked: 0, mismatches: [] },
    };
  }
  if (doc.imageOnlyPages.length > 0) {
    base.warnings.push(
      `Page(s) ${doc.imageOnlyPages.join(", ")} contain no extractable text and were skipped (OCR would be required).`,
    );
  }

  if (isPaytmStatement(doc)) {
    throw new ParseError(
      "This is a Paytm UPI statement, not a bank statement. Upload it under “Payment app history” on this page — it adds payee names, notes and tags to your bank transactions.",
      "UNSUPPORTED",
    );
  }

  const candidates: PdfAdapter[] = input.adapterId
    ? [...PDF_ADAPTERS, genericPdfAdapter].filter((a) => a.id === input.adapterId)
    : [...PDF_ADAPTERS.filter((a) => a.detect(doc)), genericPdfAdapter];

  for (const adapter of candidates) {
    const { rows, headerFound } = parseColumnarPdf(doc.lines, adapter.config);
    if (!headerFound || rows.length === 0) continue;
    const meta = adapter.meta(doc);
    if (adapter === genericPdfAdapter) {
      base.warnings.push("Bank format not recognised; a generic parser was used. Review the preview carefully.");
    }
    return finalizeRows({ ...base, parserId: adapter.id, parserVersion: adapter.version, meta, rows });
  }
  return {
    ...base,
    parserId: "none",
    parserVersion: "0",
    meta: {},
    rows: [],
    errors: ["No transaction table could be found in this PDF. Try a CSV/XLSX export from your bank."],
    balanceCheck: { status: "NOT_AVAILABLE", checked: 0, mismatches: [] },
  };
}

function readGrid(kind: "CSV" | "XLSX", bytes: Uint8Array): string[][] {
  if (kind === "CSV") {
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
    return parsed.data.map((r) => r.map((c) => String(c ?? "")));
  }
  const wb = XLSX.read(bytes, { type: "array", cellDates: false, dense: true });
  // Use the sheet with the most rows (banks sometimes add a cover sheet).
  let best: string[][] = [];
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], {
      header: 1,
      raw: false,
      defval: "",
      dateNF: "dd/mm/yyyy",
      blankrows: true,
    });
    if (grid.length > best.length) best = grid.map((r) => r.map((c) => String(c ?? "")));
  }
  return best;
}

export function parseTabular(kind: "CSV" | "XLSX", grid: string[][], mapping?: ColumnMapping): ParseResult {
  const headerRowIndex = detectHeaderRow(grid);
  const headers = headerRowIndex >= 0 ? grid[headerRowIndex] : (grid[0] ?? []).map((_, i) => `Column ${i + 1}`);
  const m = mapping ?? autoMap(headers);
  const errors = mappingErrors(m);
  const warnings: string[] = [];
  if (headerRowIndex < 0) warnings.push("No header row was recognised. Map the columns manually.");
  const rows = errors.length ? [] : rowsFromGrid(grid, headerRowIndex, m);
  const result = finalizeRows({
    parserId: kind === "CSV" ? "tabular-csv" : "tabular-xlsx",
    parserVersion: TABULAR_PARSER_VERSION,
    fileType: kind,
    meta: {},
    rows,
    warnings,
    errors,
  });
  return {
    ...result,
    table: { headerRowIndex, headers, rows: grid.slice(Math.max(headerRowIndex, 0)) },
    mapping: m,
  };
}
