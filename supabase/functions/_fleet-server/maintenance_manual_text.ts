/**
 * The page's own text, read out of the PDF before any model is called.
 *
 * Why this exists: the Roomy page prints two brackets that mean different things — 〔 first time 〕 and
 * 「 severe 」「 — and in the manual's own font they are drawn as the same corner shape. A reader looking at a
 * picture of the table cannot tell them apart (DeepSeek read the coolant's 〔160〕 as a severe interval twice,
 * with the same picture). The PDF's text layer does carry the real characters, so we hand DeepSeek the
 * characters the page actually contains and let it do the reading, the translation and the row building.
 *
 * A scanned page has no text layer; `readPageText` then answers "" and the reader falls back to sending the page
 * PDF itself (`rich_layout_recognition`), exactly as it did before.
 *
 * pdf.js (through `unpdf`, which is built for serverless runtimes) extracts in content-stream order, which for a
 * maintenance table is the order the page was drawn: the part rows come out one printed line at a time. Re-sorting
 * by y would interleave two tables printed side by side, which is worse, so the stream order is kept.
 */
import { getDocumentProxy } from "npm:unpdf@0.12.1";

/** Below this, a page is a picture (a scan) rather than a typed table: the PDF is sent instead. */
export const MANUAL_TEXT_MIN_CHARS = 200;
/** A page's text is a table, not a book chapter; a bigger answer is a broken extraction. */
export const MANUAL_TEXT_MAX_CHARS = 20_000;

/** Two text runs belong to the same printed line when their baselines are this close (PDF points). */
const LINE_TOLERANCE = 2;

type TextItem = { str?: string; transform?: number[] };

/**
 * Join pdf.js text runs into printed lines, keeping the order the page was drawn in.
 *
 * Exported so a test can hand it the runs of a real page (the Roomy coolant line, whose brackets matter) without
 * shipping a PDF; `readPageText` is the thin wrapper that gets those runs out of a page.
 */
export function groupTextItems(items: TextItem[], tolerance = LINE_TOLERANCE): string[] {
  const lines: string[] = [];
  let line = "";
  let lineY: number | null = null;

  for (const item of items) {
    const text = item.str ?? "";
    if (!text) continue;
    const y = item.transform?.[5];
    if (typeof y === "number") {
      if (lineY !== null && Math.abs(y - lineY) > tolerance) {
        lines.push(line);
        line = "";
      }
      lineY = y;
    }
    line += text;
  }
  if (line) lines.push(line);

  return lines
    .map((l) => l.replace(/[ \t\u3000]+$/g, ""))
    .filter((l) => l.trim().length > 0);
}

/**
 * The first page's text, one printed line per line. Answers "" for a page with no text layer and for anything
 * that cannot be parsed (a damaged PDF, a password) — the caller then reads the page as a picture instead of
 * failing the page here.
 */
export async function readPageText(pdfBytes: Uint8Array): Promise<string> {
  if (!pdfBytes || !pdfBytes.length) return "";
  let doc: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    doc = await getDocumentProxy(new Uint8Array(pdfBytes), { verbosity: 0 });
    if (!doc.numPages) return "";
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const lines = groupTextItems((content.items ?? []) as TextItem[]);
    return lines.join("\n").slice(0, MANUAL_TEXT_MAX_CHARS);
  } catch {
    return "";
  } finally {
    // Free the worker's memory and the pdf.js document; a failure here must not fail the read.
    try {
      await doc?.destroy();
    } catch {
      // ignore
    }
  }
}

/**
 * Is this a typed page worth reading as text? A real table page prints hundreds of characters and some digits.
 * Anything shorter is a scan, a cover page, or a failed extraction — the PDF is sent instead.
 */
export function isTypedPageText(text: string | null | undefined): boolean {
  const value = String(text ?? "");
  return value.length >= MANUAL_TEXT_MIN_CHARS && /\d/.test(value);
}
