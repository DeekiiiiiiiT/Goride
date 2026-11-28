/**
 * Step 3 — cutting one page out of a manual with pdf-lib, on a made-up PDF built in the test.
 * deno test --no-check supabase/functions/_fleet-server/maintenance_manual_pdf.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import { countPdfPages, extractPdfPage, PdfProblemError } from "./maintenance_manual_pdf.ts";

/** A made-up 5-page manual. Every page has its own width, so a cut page can be told apart. */
async function madeUpManual(pages = 5): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([400 + i * 10, 595]);
    page.drawText(`Maintenance table page ${i}`, { x: 40, y: 520, size: 14, font });
  }
  return await doc.save();
}

Deno.test("countPdfPages counts what the file really has", async () => {
  const bytes = await madeUpManual(5);
  assertEquals(await countPdfPages(bytes), 5);
});

Deno.test("a page is cut into its own one-page PDF", async () => {
  const bytes = await madeUpManual(5);
  const page3 = await extractPdfPage(bytes, 3);
  assertEquals(await countPdfPages(page3), 1);

  // The cut file really is page 3, not another page or the whole manual: every page in the
  // fixture has its own width (page 3 is 430 wide).
  const cut = await PDFDocument.load(page3);
  const { width, height } = cut.getPage(0).getSize();
  assertEquals(width, 430);
  assertEquals(height, 595);
});

Deno.test("a page number the file does not have is refused, plainly", async () => {
  const bytes = await madeUpManual(5);
  for (const bad of [0, 6, -1, 2.5]) {
    let threw = false;
    try {
      await extractPdfPage(bytes, bad);
    } catch (err) {
      threw = true;
      if (!(err instanceof PdfProblemError)) throw new Error(`expected PdfProblemError for ${bad}`);
      if (!err.message.includes("5 pages")) throw new Error(`the reason must say how many pages there are: ${err.message}`);
    }
    if (!threw) throw new Error(`page ${bad} should have been refused`);
  }
});

Deno.test("something that is not a PDF is refused with a plain reason", async () => {
  const notPdf = new TextEncoder().encode("this is a text file, not a PDF");
  let message = "";
  try {
    await countPdfPages(notPdf);
  } catch (err) {
    message = err instanceof Error ? err.message : "";
  }
  if (!message.includes("not a PDF")) throw new Error(`expected a plain "not a PDF" reason, got "${message}"`);
});

Deno.test("an empty file is refused", async () => {
  let message = "";
  try {
    await countPdfPages(new Uint8Array());
  } catch (err) {
    message = err instanceof Error ? err.message : "";
  }
  if (!message) throw new Error("an empty file must be refused");
});
