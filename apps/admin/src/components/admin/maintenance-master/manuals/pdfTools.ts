/**
 * Owner's manual PDFs in the browser: page count and SHA-256 before upload (the server checks both), and
 * page pictures for the upload preview and the check screen. pdf.js runs in its own worker from this origin.
 */
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type PdfjsLib = typeof import("pdfjs-dist");
type PdfDoc = Awaited<ReturnType<PdfjsLib["getDocument"]>["promise"]>;

let libPromise: Promise<PdfjsLib> | null = null;

async function pdfjs(): Promise<PdfjsLib> {
  if (!libPromise) {
    libPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return lib;
    });
  }
  return libPromise;
}

/**
 * Character maps let pdf.js turn Japanese (and other CJK) fonts into real text. They ship with Dominion
 * (public/pdfjs-cmaps, copied from pdfjs-dist) because the site's security rules allow no outside scripts or data.
 */
const PDF_OPTIONS = { cMapUrl: "/pdfjs-cmaps/", cMapPacked: true } as const;

/** The text of each listed page (1-based PDF pages), in reading order. Pages with no text layer give "". */
export async function readPagesText(doc: PdfDoc, pages: number[]): Promise<Array<{ pdf_page: number; text: string }>> {
  const out: Array<{ pdf_page: number; text: string }> = [];
  for (const p of pages) {
    if (p < 1 || p > doc.numPages) continue;
    try {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const text = content.items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      out.push({ pdf_page: p, text });
    } catch {
      out.push({ pdf_page: p, text: "" });
    }
  }
  return out;
}

/** One page as a JPEG data URL (no "data:" prefix), for a scanned document with no text layer. */
export async function pageAsJpegBase64(doc: PdfDoc, pageNo: number, width = 900): Promise<string> {
  const canvas = document.createElement("canvas");
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.8).replace(/^data:image\/jpeg;base64,/, "");
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type PdfInfo = { pageCount: number; sha256: string; doc: PdfDoc };

/** Reads a chosen file. Throws a plain-words error when it is not a readable PDF. */
export async function readPdfFile(file: File): Promise<PdfInfo> {
  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes.slice(0, 5));
  if (String.fromCharCode(...head) !== "%PDF-") {
    throw new Error("This file is not a PDF. Choose the owner's manual as a PDF file.");
  }
  const sha256 = await sha256Hex(bytes);
  const lib = await pdfjs();
  try {
    // pdf.js takes ownership of the buffer it is given, so give it a copy.
    const doc = await lib.getDocument({ data: new Uint8Array(bytes.slice(0)), ...PDF_OPTIONS }).promise;
    return { pageCount: doc.numPages, sha256, doc };
  } catch {
    throw new Error("This PDF could not be opened. It may be damaged or locked with a password.");
  }
}

/** Opens a PDF from a link (the one-page PDFs the server cuts). Throws when the browser may not read it. */
export async function openPdfUrl(url: string): Promise<PdfDoc> {
  const lib = await pdfjs();
  return lib.getDocument({ url, ...PDF_OPTIONS }).promise;
}

/** Draws one page into a canvas, fitted to the given width. */
export async function drawPage(doc: PdfDoc, pageNo: number, canvas: HTMLCanvasElement, width: number): Promise<void> {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = width / base.width;
  const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${(viewport.height / viewport.width) * width}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  await page.render({ canvasContext: ctx, viewport }).promise;
}
