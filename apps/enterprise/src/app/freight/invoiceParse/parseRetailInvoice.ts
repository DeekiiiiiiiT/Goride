import { extractPdfPlainText } from './extractPdfText';
import { parseRetailInvoiceText } from './parseRetailInvoiceText';
import { emptySuggestion, type InvoiceParseSuggestion } from './types';

function isPdf(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  return mime === 'application/pdf' || name.endsWith('.pdf');
}

function isImage(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  return mime.startsWith('image/');
}

/** Public entry: File → suggestion (pdf_text V1; images return empty + warning). */
export async function parseRetailInvoice(file: File): Promise<InvoiceParseSuggestion> {
  if (isImage(file)) {
    return emptySuggestion({
      source: 'pdf_text',
      confidence: 'none',
      warnings: [
        'Image invoices can’t be read yet — use a text PDF, or enter fields manually. Photo/scan parse is coming next.',
      ],
    });
  }

  if (!isPdf(file)) {
    return emptySuggestion({
      source: 'pdf_text',
      confidence: 'none',
      warnings: ['Unsupported file type. Upload a PDF invoice for smart fill.'],
    });
  }

  try {
    const buf = await file.arrayBuffer();
    const text = await extractPdfPlainText(buf);
    return parseRetailInvoiceText(text);
  } catch {
    return emptySuggestion({
      source: 'pdf_text',
      confidence: 'none',
      warnings: ['Could not read this PDF. Enter fields manually.'],
    });
  }
}

/** Fill only blank target fields from a suggestion. */
export function applySuggestionToBlanks<
  T extends {
    retailer?: string;
    description?: string;
    declaredValueUsd?: string;
    weightLbs?: string;
  },
>(current: T, suggestion: InvoiceParseSuggestion): T {
  const next = { ...current };
  if (!String(next.retailer ?? '').trim() && suggestion.retailer) {
    next.retailer = suggestion.retailer;
  }
  if (!String(next.description ?? '').trim() && suggestion.description) {
    next.description = suggestion.description;
  }
  if (!String(next.declaredValueUsd ?? '').trim() && suggestion.declaredValueUsd != null) {
    next.declaredValueUsd = String(suggestion.declaredValueUsd);
  }
  if (!String(next.weightLbs ?? '').trim() && suggestion.weightLbs != null) {
    next.weightLbs = String(suggestion.weightLbs);
  }
  return next;
}
