/** Shared invoice parse contract — pdf_text now; ai_vision later without UI redesign. */

export type InvoiceParseSource = 'pdf_text' | 'ai_vision';

export type InvoiceParseConfidence = 'high' | 'medium' | 'low' | 'none';

export type InvoiceParseSuggestion = {
  source: InvoiceParseSource;
  retailer: string | null;
  description: string | null;
  declaredValueUsd: number | null;
  weightLbs: number | null;
  /** Detected currency code when present (package commerce is USD). */
  currencyHint: string | null;
  confidence: InvoiceParseConfidence;
  warnings: string[];
  /** Raw item titles used to build description. */
  itemLabels: string[];
};

export function emptySuggestion(
  partial: Partial<InvoiceParseSuggestion> & Pick<InvoiceParseSuggestion, 'source'>,
): InvoiceParseSuggestion {
  return {
    retailer: null,
    description: null,
    declaredValueUsd: null,
    weightLbs: null,
    currencyHint: null,
    confidence: 'none',
    warnings: [],
    itemLabels: [],
    ...partial,
  };
}
