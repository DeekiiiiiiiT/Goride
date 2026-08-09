/** Client-side PDF text extract via pdfjs (text layer only — not OCR). */

export async function extractPdfPlainText(data: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const str = (tc.items as Array<{ str?: string }>)
      .map((it) => it.str || '')
      .join(' ');
    pages.push(str);
  }
  return pages.join('\n\n');
}
