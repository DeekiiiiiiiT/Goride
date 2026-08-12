/** Shared invoice parse contract — pdf_text now; ai_vision later without UI redesign. */

export type InvoiceParseSource = 'pdf_text' | 'ai_vision';

export type InvoiceParseConfidence = 'high' | 'medium' | 'low' | 'none';

export type InvoiceParseLine = {
  description: string;
  quantity: number | null;
  unitValueUsd: number | null;
  lineTotalUsd: number | null;
};

/** Ship-to fragment used to match Dominion intake / org warehouses. */
export type InvoiceShipToHint = {
  streetLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

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
  /** Amazon / retailer order number when found. */
  externalOrderNumber: string | null;
  /** Mailbox suite code from ship-to address when found (e.g. BSHPD10859). */
  suiteCode: string | null;
  /** Ship-to street/city/ZIP for warehouse auto-select. */
  shipTo: InvoiceShipToHint | null;
  /** Order grand total (same as declaredValueUsd when strong total found). */
  orderTotalUsd: number | null;
  /** Structured merchandise lines for Order → packages assignment. */
  lines: InvoiceParseLine[];
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
    externalOrderNumber: null,
    suiteCode: null,
    shipTo: null,
    orderTotalUsd: null,
    lines: [],
    ...partial,
  };
}
