import { emptySuggestion, type InvoiceParseSuggestion } from './types';

const TOTAL_LABELS =
  /(?:grand\s*total|order\s*total|amount\s*due|total\s*due|invoice\s*total|total\s*\(?usd\)?)\s*[:.]?\s*/i;

const WEAK_TOTALS = /(?:subtotal|sub\s*total|items?\s*subtotal)\s*[:.]?\s*/i;

const MONEY =
  /(?:USD|US\$|\$|CAD|C\$|EUR|€|GBP|£)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+\.[0-9]{2})/;

const WEIGHT =
  /\b([0-9]+(?:\.[0-9]+)?)\s*(lb|lbs|pounds?|kg|kilograms?)\b/i;

const CURRENCY_HINT =
  /\b(USD|CAD|EUR|GBP|JMD|TTD)\b|(?:US\$|\$)\s*[0-9]|€\s*[0-9]|£\s*[0-9]/i;

/** Heuristics for Amazon + generic retailer invoice text (no schema required). */
export function parseRetailInvoiceText(rawText: string): InvoiceParseSuggestion {
  const text = collapseWs(rawText || '');
  if (!text.trim()) {
    return emptySuggestion({
      source: 'pdf_text',
      confidence: 'none',
      warnings: ['No readable text in this PDF (scanned/image-only). Enter fields manually.'],
    });
  }

  const warnings: string[] = [];
  const isAmazon = /\bamazon\b/i.test(text) || /\bamzn\b/i.test(text);

  const retailer = detectRetailer(text, isAmazon);
  const { amount: strongTotal, currency: strongCur } = findLabeledMoney(text, TOTAL_LABELS);
  const { amount: weakTotal, currency: weakCur } = findLabeledMoney(text, WEAK_TOTALS);
  let declaredValueUsd = strongTotal ?? weakTotal;
  if (strongTotal == null && weakTotal != null) {
    warnings.push('Used subtotal — confirm against Grand Total on the invoice.');
  }

  let currencyHint = strongCur ?? weakCur ?? detectCurrencyHint(text);
  if (currencyHint && currencyHint !== 'USD') {
    warnings.push(
      `Invoice looks like ${currencyHint}; package declared value is stored as USD — confirm the amount.`,
    );
  }
  if (!currencyHint && /\$/.test(text)) currencyHint = 'USD';

  const itemLabels = extractItemLabels(text, isAmazon);
  const description =
    itemLabels.length > 0
      ? itemLabels.slice(0, 3).join('; ') + (itemLabels.length > 3 ? '; …' : '')
      : null;

  const weightLbs = extractWeightLbs(text);

  const filled = [retailer, description, declaredValueUsd, weightLbs].filter(
    (v) => v != null && v !== '',
  ).length;

  let confidence: InvoiceParseSuggestion['confidence'] = 'none';
  if (filled >= 3 && declaredValueUsd != null) confidence = 'high';
  else if (filled >= 2) confidence = 'medium';
  else if (filled >= 1) confidence = 'low';
  else {
    warnings.push('Could not find value, retailer, or items — enter fields manually.');
  }

  return {
    source: 'pdf_text',
    retailer,
    description,
    declaredValueUsd,
    weightLbs,
    currencyHint,
    confidence,
    warnings,
    itemLabels,
  };
}

function collapseWs(s: string): string {
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
}

function detectRetailer(text: string, isAmazon: boolean): string | null {
  if (isAmazon) return 'Amazon';

  const soldBy = text.match(/\bsold\s+by\s*[:\s]+([A-Za-z0-9][A-Za-z0-9 &.,'\-]{1,60})/i);
  if (soldBy?.[1]) return cleanName(soldBy[1]);

  const orderFrom = text.match(/\border\s+from\s*[:\s]+([A-Za-z0-9][A-Za-z0-9 &.,'\-]{1,60})/i);
  if (orderFrom?.[1]) return cleanName(orderFrom[1]);

  const known: Array<[RegExp, string]> = [
    [/\bshein\b/i, 'Shein'],
    [/\btemu\b/i, 'Temu'],
    [/\bwalmart\b/i, 'Walmart'],
    [/\bebay\b/i, 'eBay'],
    [/\bbest\s*buy\b/i, 'Best Buy'],
    [/\btarget\b/i, 'Target'],
    [/\bapple\b/i, 'Apple'],
    [/\bnike\b/i, 'Nike'],
  ];
  for (const [re, name] of known) {
    if (re.test(text)) return name;
  }
  return null;
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function findLabeledMoney(
  text: string,
  labelRe: RegExp,
): { amount: number | null; currency: string | null } {
  const re = new RegExp(labelRe.source + MONEY.source, 'gi');
  let best: number | null = null;
  let currency: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    const n = parseMoney(m[1]);
    if (n == null) continue;
    // Prefer the last/largest order total style match
    if (best == null || n >= best) {
      best = n;
      const chunk = m[0];
      currency = currencyFromChunk(chunk) ?? currency;
    }
  }
  return { amount: best, currency };
}

function parseMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

function currencyFromChunk(chunk: string): string | null {
  if (/CAD|C\$/i.test(chunk)) return 'CAD';
  if (/EUR|€/i.test(chunk)) return 'EUR';
  if (/GBP|£/i.test(chunk)) return 'GBP';
  if (/JMD/i.test(chunk)) return 'JMD';
  if (/USD|US\$/i.test(chunk)) return 'USD';
  if (/\$/.test(chunk)) return 'USD';
  return null;
}

function detectCurrencyHint(text: string): string | null {
  const m = text.match(CURRENCY_HINT);
  if (!m) return null;
  const raw = m[0].toUpperCase();
  if (raw.includes('CAD') || raw.includes('C$')) return 'CAD';
  if (raw.includes('EUR') || raw.includes('€')) return 'EUR';
  if (raw.includes('GBP') || raw.includes('£')) return 'GBP';
  if (raw.includes('JMD')) return 'JMD';
  if (raw.includes('TTD')) return 'TTD';
  if (raw.includes('USD') || raw.includes('US$') || raw.includes('$')) return 'USD';
  return null;
}

function extractWeightLbs(text: string): number | null {
  const m = text.match(WEIGHT);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 500) return null;
  const unit = m[2].toLowerCase();
  if (unit.startsWith('kg') || unit.startsWith('kilo')) {
    return Math.round(n * 2.2046226218 * 100) / 100;
  }
  return Math.round(n * 100) / 100;
}

const SKIP_LINE =
  /\b(ship to|sold by|order\s*#|order number|asin|isbn|invoice|payment|credit card|visa|mastercard|billing|tax|shipping|handling|gift|promo|coupon|www\.|http|suite|po box|shipment\s*weight|weight|grand\s*total|order\s*total|amount\s*due|subtotal|\d{5}(?:-\d{4})?)\b/i;

function extractItemLabels(text: string, isAmazon: boolean): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // pdfjs often returns one long space-joined line per page — split soft clauses
  if (lines.length <= 2 && text.length > 40) {
    const soft = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+|(?=\b(?:Qty|Quantity|Grand Total|Order Total|Subtotal|Shipment)\b)/i)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    for (const s of soft) {
      if (!lines.includes(s)) lines.push(s);
    }
  }

  const items: string[] = [];
  for (const line of lines) {
    if (line.length < 12 || line.length > 160) continue;
    if (SKIP_LINE.test(line)) continue;
    if (/^\$?\d/.test(line)) continue;
    if (/^[0-9]{5,}$/.test(line)) continue;
    // Product-ish: letters + maybe qty/price nearby
    if (!/[A-Za-z]{4,}/.test(line)) continue;
    if (isAmazon && /\bqty\b|\bquantity\b|of\s+\d+\s*$/i.test(line) && line.length < 20) {
      continue;
    }
    // Prefer lines that look like titles (mixed case / long words)
    const words = line.split(' ').filter((w) => w.length > 2);
    if (words.length < 2) continue;
    if (TOTAL_LABELS.test(line) || WEAK_TOTALS.test(line)) continue;
    // Drop retailer/order header blobs
    if (/^amazon(\.com)?(\s+order)?$/i.test(line)) continue;
    if (/\border\s*#|\border\s+number/i.test(line)) continue;
    const cleaned = line
      .replace(/\bAmazon\.com\s+Order\b/gi, '')
      .replace(/\s+\$[0-9,.]+.*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length < 10) continue;
    if (items.some((x) => x.toLowerCase() === cleaned.toLowerCase())) continue;
    items.push(cleaned.slice(0, 120));
    if (items.length >= 6) break;
  }
  // Fallback: capture product text between order header and total (common Amazon layout)
  if (items.length === 0) {
    const m = text
      .replace(/\s+/g, ' ')
      .match(
        /(?:amazon\.com\s+order|order\s*#?\s*[\w-]+)\s+(.+?)\s+(?:grand\s*total|order\s*total|amount\s*due)/i,
      );
    if (m?.[1]) {
      const chunk = m[1]
        .replace(/\b(sold by|qty|quantity)\b.*/i, '')
        .replace(/\s+\$[0-9,.]+/g, '')
        .trim();
      if (chunk.length >= 10) items.push(chunk.slice(0, 120));
    }
  }
  return items;
}
