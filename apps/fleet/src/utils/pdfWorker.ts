import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfjsLib = typeof import('pdfjs-dist');

/**
 * PDF.js loads its parser in a worker. Fleet CSP allows workers only from this
 * origin (`worker-src 'self'`), so a CDN worker (esm.sh) is blocked and PDF.js
 * reports "Setting up fake worker failed".
 */
export function ensurePdfWorker(pdfjsLib: PdfjsLib): void {
  if (typeof window === 'undefined') return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}
