import { ParseError } from "../types";

export interface PdfItem {
  x: number;
  xEnd: number;
  str: string;
}

export interface PdfLine {
  page: number;
  y: number;
  items: PdfItem[];
  text: string;
}

export interface PdfDocumentText {
  pageCount: number;
  lines: PdfLine[];
  fullText: string;
  /** Pages that contain (almost) no extractable text — likely scanned images. */
  imageOnlyPages: number[];
}

const Y_TOLERANCE = 1.5;

/**
 * Extract positioned text from a text-based PDF. The password, if any, is used only
 * in memory for this call and is never stored or logged.
 */
export async function extractPdfText(data: Uint8Array, password?: string): Promise<PdfDocumentText> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data,
      password: password || undefined,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    }).promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e?.name === "PasswordException") {
      throw new ParseError(
        e.code === 2 ? "The PDF password is incorrect." : "This PDF is password protected. Enter the statement password.",
        e.code === 2 ? "PASSWORD_INCORRECT" : "PASSWORD_REQUIRED",
      );
    }
    throw new ParseError("The file could not be read as a PDF.", "INVALID_FILE");
  }

  const numPages = doc.numPages;
  const lines: PdfLine[] = [];
  const imageOnlyPages: number[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pageLines: PdfLine[] = [];
      let chars = 0;
      for (const raw of content.items) {
        if (!("str" in raw)) continue;
        const str = raw.str.replace(/\s+/g, " ").trim();
        if (!str) continue;
        chars += str.length;
        const x = raw.transform[4];
        const y = raw.transform[5];
        const item: PdfItem = { x, xEnd: x + raw.width, str };
        let line = pageLines.find((l) => Math.abs(l.y - y) <= Y_TOLERANCE);
        if (!line) {
          line = { page: p, y, items: [], text: "" };
          pageLines.push(line);
        }
        line.items.push(item);
      }
      if (chars < 20) imageOnlyPages.push(p);
      pageLines.sort((a, b) => b.y - a.y);
      for (const l of pageLines) {
        l.items.sort((a, b) => a.x - b.x);
        l.text = l.items.map((i) => i.str).join(" ");
      }
      lines.push(...pageLines);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return {
    pageCount: numPages,
    lines,
    fullText: lines.map((l) => l.text).join("\n"),
    imageOnlyPages,
  };
}
