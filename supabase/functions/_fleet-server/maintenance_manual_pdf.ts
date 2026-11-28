/**
 * Step 3 — one page out of an owner's manual, with pdf-lib (pure JS, no native build).
 *
 * The manual is read once by the "uploaded" route to count its pages, and again by the worker, which cuts the
 * single page it is about to send. Only that page ever leaves the server, so Gemini sees one page at a time
 * and the answer can name the page it came from.
 */
import { PDFDocument } from "npm:pdf-lib@1.17.1";

/** Upload limit for a manual (step 3 brief): 100 MB. */
export const MAX_MANUAL_BYTES = 100 * 1024 * 1024;

/** A page count we are willing to queue (an owner's manual is hundreds, not thousands of pages). */
export const MAX_MANUAL_PAGES = 4000;

export class PdfProblemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfProblemError";
  }
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    throw new PdfProblemError("This file is not a PDF we can read. Upload the manual as a PDF.");
  }
}

/** How many pages the file really has. */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  if (!bytes.length) throw new PdfProblemError("The uploaded file is empty.");
  const doc = await loadPdf(bytes);
  const pages = doc.getPageCount();
  if (pages < 1) throw new PdfProblemError("This PDF has no pages.");
  if (pages > MAX_MANUAL_PAGES) {
    throw new PdfProblemError(`This PDF has ${pages} pages, which is more than a manual should.`);
  }
  return pages;
}

/** One page as its own one-page PDF. `pageNo` is 1-based, as printed in the manual. */
export async function extractPdfPage(bytes: Uint8Array, pageNo: number): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const total = doc.getPageCount();
  if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > total) {
    throw new PdfProblemError(`This PDF has ${total} pages, so page ${pageNo} cannot be read.`);
  }
  const out = await PDFDocument.create();
  const [copied] = await out.copyPages(doc, [pageNo - 1]);
  out.addPage(copied);
  return await out.save();
}
