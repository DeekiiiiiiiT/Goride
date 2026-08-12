import { emptySuggestion, type InvoiceParseLine, type InvoiceParseSuggestion } from './types';

const TOTAL_LABELS =
  /(?:grand\s*total|order\s*total|amount\s*due|total\s*due|invoice\s*total|total\s*\(?usd\)?)\s*[:.]?\s*/i;

const WEAK_TOTALS = /(?:subtotal|sub\s*total|items?\s*subtotal)\s*[:.]?\s*/i;

const MONEY =
  /(?:USD|US\$|\$|CAD|C\$|EUR|€|GBP|£)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+\.[0-9]{2})/;

const WEIGHT =
  /\b([0-9]+(?:\.[0-9]+)?)\s*(lb|lbs|pounds?|kg|kilograms?)\b/i;

const CURRENCY_HINT =
  /\b(USD|CAD|EUR|GBP|JMD|TTD)\b|(?:US\$|\$)\s*[0-9]|€\s*[0-9]|£\s*[0-9]/i;

const ORDER_NUMBER =
  /\border\s*(?:#|number|no\.?)\s*[:.]?\s*((?:\d{3}-\d{7}-\d{7})|(?:[A-Z0-9][A-Z0-9-]{6,40}))/i;

const AMAZON_ORDER_ID = /\b(\d{3}-\d{7}-\d{7})\b/;

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
  const externalOrderNumber = extractOrderNumber(text);
  const suiteCode = extractSuiteCode(text);
  const shipTo = extractShipToAddress(text);
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

  const lines = extractStructuredLines(text, isAmazon);
  const itemLabels =
    lines.length > 0 ? lines.map((l) => l.description) : extractItemLabels(text, isAmazon);
  const description =
    itemLabels.length > 0
      ? itemLabels.slice(0, 3).join('; ') + (itemLabels.length > 3 ? '; …' : '')
      : null;

  const weightLbs = extractWeightLbs(text);
  const orderTotalUsd = declaredValueUsd;
  const estimatedTaxUsd = extractEstimatedTaxUsd(text);
  const merchandiseSubtotalUsd = findLabeledMoney(text, WEAK_TOTALS).amount;

  const filled = [retailer, description, declaredValueUsd, weightLbs, externalOrderNumber].filter(
    (v) => v != null && v !== '',
  ).length;

  let confidence: InvoiceParseSuggestion['confidence'] = 'none';
  if ((lines.length >= 1 && declaredValueUsd != null) || (filled >= 3 && declaredValueUsd != null)) {
    confidence = 'high';
  } else if (filled >= 2 || lines.length >= 1) confidence = 'medium';
  else if (filled >= 1) confidence = 'low';
  else {
    warnings.push('Could not find value, retailer, or items — enter fields manually.');
  }

  if (lines.length > 1) {
    warnings.push(
      'Multiple items found — assign each line to the correct package tracking number (Amazon may split boxes).',
    );
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
    externalOrderNumber,
    suiteCode,
    shipTo,
    orderTotalUsd,
    estimatedTaxUsd,
    merchandiseSubtotalUsd,
    lines,
  };
}

function collapseWs(s: string): string {
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
}

function extractOrderNumber(text: string): string | null {
  // Amazon / marketplace IDs like 111-7351808-5310605 (prefer over "Order Summary")
  const amazon = text.match(AMAZON_ORDER_ID);
  if (amazon?.[1]) return amazon[1];

  const m = text.match(ORDER_NUMBER);
  if (!m?.[1]) return null;
  const raw = m[1].trim().slice(0, 40);
  // Reject header words captured from "Order Summary" / "Order Details"
  if (/^(summary|details|total|history|number|info|information)$/i.test(raw)) {
    return null;
  }
  return raw;
}

/** Suite / mailbox code from ship-to (Suite BSHPD10859 or embedded in address line). */
function extractSuiteCode(text: string): string | null {
  const labeled =
    text.match(/\bsuite\s*(?:#|code|no\.?)?\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{2,39})\b/i) ||
    text.match(/\bmailbox\s*(?:#|code|id)?\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{2,39})\b/i);
  if (labeled?.[1]) {
    const code = labeled[1].toUpperCase();
    if (!/^(CODE|NUMBER|NO|ID|ADDRESS)$/i.test(code)) return code;
  }

  // Amazon often puts suite in the street line: "1807 SW 31ST AVE BSHPD10859"
  // Prefer letter+digit mailbox tokens (not pure street numbers / ZIP).
  const candidates = text.match(/\b([A-Z]{2,}[0-9]{2,}[A-Z0-9]*)\b/gi) ?? [];
  for (const raw of candidates) {
    const code = raw.toUpperCase();
    if (code.length < 4 || code.length > 24) continue;
    if (/^(UPS|USPS|FEDEX|DHL|AMZN|ASIN|ISBN)$/i.test(code)) continue;
    // Must mix letters + digits
    if (!/[A-Z]/.test(code) || !/[0-9]/.test(code)) continue;
    return code;
  }
  return null;
}

/** Ship-to street / city / ZIP for matching Dominion intake warehouses. */
function extractShipToAddress(text: string): InvoiceParseSuggestion['shipTo'] {
  const block =
    text.match(
      /\bShip\s+to\b\s*(.{15,260}?)(?=\b(?:United\s+States|Payment\s+method|Mastercard|Visa|Order\s+Summary|Item\(s\)\s+Subtotal|Delivered)\b)/i,
    )?.[1] || text;

  const postal =
    block.match(/\b([A-Z][A-Za-z .'-]{2,40}),?\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/) ||
    text.match(/\b([A-Z][A-Za-z .'-]{2,40}),?\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/);

  let city: string | null = null;
  let state: string | null = null;
  let postalCode: string | null = null;
  if (postal) {
    city = postal[1].replace(/\s+/g, ' ').trim();
    state = postal[2].toUpperCase();
    postalCode = postal[3];
  } else {
    const zipOnly = block.match(/\b(\d{5})(?:-\d{4})?\b/) || text.match(/\b(\d{5})(?:-\d{4})?\b/);
    postalCode = zipOnly?.[1] ?? null;
  }

  // Street: house number + road tokens before city/ZIP (strip mailbox suite token)
  const streetMatch =
    block.match(
      /\b(\d{1,6}\s+(?:[NSEW]{1,2}\s+)?\d{0,4}\s*[A-Za-z0-9.'\- ]{3,60}?(?:AVE|AVENUE|ST|STREET|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|WAY|HWY|HIGHWAY)\b)/i,
    ) ||
    text.match(
      /\b(\d{1,6}\s+(?:[NSEW]{1,2}\s+)?\d{0,4}\s*[A-Za-z0-9.'\- ]{3,60}?(?:AVE|AVENUE|ST|STREET|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|WAY|HWY|HIGHWAY)\b)/i,
    );

  let streetLine = streetMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
  if (streetLine) {
    streetLine = streetLine
      .replace(/\b(BSHPD|CS-?)[A-Z0-9-]{2,}\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!streetLine && !postalCode && !city) return null;
  return { streetLine, city, state, postalCode };
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

const TAX_LABELS =
  /(?:estimated\s+tax(?:\s+to\s+be\s+collected)?|sales\s+tax|tax\s+collected)\s*[:.]?\s*/i;

function extractEstimatedTaxUsd(text: string): number | null {
  const { amount } = findLabeledMoney(text, TAX_LABELS);
  return amount;
}

const SKIP_LINE =
  /\b(ship to|sold by|order\s*#|order number|asin|isbn|invoice|payment|credit card|visa|mastercard|billing|tax|shipping|handling|gift|promo|coupon|www\.|http|suite|po box|shipment\s*weight|weight|grand\s*total|order\s*total|amount\s*due|subtotal|\d{5}(?:-\d{4})?)\b/i;

/** PDF text often splits fi/fl/ff ligatures ("O ffi ce", "Lea fl ai"). */
function fixPdfLigatures(s: string): string {
  return s
    .replace(/\s+ffi\s+/gi, 'ffi')
    .replace(/\s+ffl\s+/gi, 'ffl')
    .replace(/\s+fi\s+/gi, 'fi')
    .replace(/\s+fl\s+/gi, 'fl')
    .replace(/\s+ff\s+/gi, 'ff');
}

function isJunkProductTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 12) return true;
  if (/^amazon(\.com)?$/i.test(t)) return true;
  if (/^return\s+or\s+replace/i.test(t)) return true;
  if (/\breturn\s+or\s+replace\b/i.test(t) && t.length < 90) return true;
  if (/^(sold\s+by|supplied\s+by|eligible)\b/i.test(t)) return true;
  if (/^(items?|subtotal|shipping|grand|total|tax|payment|free\s+shipping)/i.test(t)) return true;
  if (TOTAL_LABELS.test(t) || WEAK_TOTALS.test(t)) return true;
  // Seller-only leftovers: "Yungmaii", "Wavechain Tech", "QIMIAO SHOP"
  if (/^[A-Z0-9][A-Za-z0-9.&'’ -]{1,40}$/.test(t) && t.split(/\s+/).length <= 4) {
    if (!/\b(bottle|cover|wax|washer|spray|oil|chair|cable|speaker|set|pack|kit|bag|hose)\b/i.test(t)) {
      return true;
    }
  }
  return false;
}

/** Prefer text immediately before "Sold by:" (Amazon print invoice). */
function cleanProductTitle(raw: string): string {
  let t = fixPdfLigatures(collapseWs(raw));
  // Cut delivery / order-summary preamble; keep the trailing product name
  const cutAfter = [
    /\bIt was handed[^.]*\.\s*/i,
    /\bDelivered\s+[A-Za-z]+\s+\d{1,2}\s*/i,
    /\bGrand Total:\s*\$?[0-9.,]+\s*/i,
    /\bEstimated tax to be collected:\s*\$?[0-9.,]+\s*/i,
    /\bTotal before tax:\s*\$?[0-9.,]+\s*/i,
    /\bFree Shipping:\s*-?\$?[0-9.,]+\s*/i,
    /\bShipping & Handling:\s*\$?[0-9.,]+\s*/i,
    /\bItem\(s\) Subtotal:\s*\$?[0-9.,]+\s*/i,
    /\bView related transactions\s*/i,
    /\bPayment method\s*/i,
    /\bUnited States\s*/i,
  ];
  for (const re of cutAfter) {
    const m = t.match(re);
    if (m?.index != null) t = t.slice(m.index + m[0].length).trim();
  }
  t = t
    .replace(/\bReturn or replace items:.*$/i, '')
    .replace(/\b(?:sold\s+by|supplied\s+by|eligible\s+through)\b.*$/i, '')
    .replace(/\s+Qty\.?\s*\d+\s*$/i, '')
    .trim();
  // Keep the start (brand + product); long Amazon titles are common
  return t.slice(0, 200).trim();
}

/**
 * Prefer title + Sold by + $price (Amazon order details). Falls back to title-only labels.
 */
function extractStructuredLines(text: string, isAmazon: boolean): InvoiceParseLine[] {
  const flat = collapseWs(text || '');

  // Amazon print / order-details PDF: "<title> Sold by: <seller> … $12.99"
  const soldByLines = extractSoldByColonLines(flat);
  if (soldByLines.length > 0) return soldByLines;

  // Classic Amazon "Final Details" text: "<title> Qty 1 $49.99"
  const qtyLines = extractQtyPriceLines(flat);
  if (qtyLines.length > 0) return qtyLines;

  const lines: InvoiceParseLine[] = [];
  const priceToken = /\$\s*([0-9]+(?:\.[0-9]{2})?)/g;
  const spans: Array<{ amount: number; index: number; end: number }> = [];
  let pm: RegExpExecArray | null;
  while ((pm = priceToken.exec(flat)) != null) {
    const amount = parseMoney(pm[1]);
    if (amount == null || amount <= 0) continue;
    spans.push({ amount, index: pm.index, end: pm.index + pm[0].length });
  }

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const prevEnd = i === 0 ? 0 : spans[i - 1].end;
    let chunk = flat.slice(prevEnd, span.index).replace(/\s+/g, ' ').trim();
    // Prefer product text after a seller line when present in this span
    const afterSold = chunk.split(/\bSold\s+by:?\s*[^\n$]{0,80}/i).pop() ?? chunk;
    if (afterSold.trim().length >= 12) chunk = afterSold.trim();
    const qtyMatch = chunk.match(/^(.*?)(?:\s+Qty\.?\s*(\d+)\s*)$/i);
    let qty = 1;
    if (qtyMatch) {
      chunk = qtyMatch[1].trim();
      qty = Number(qtyMatch[2]) || 1;
    }
    const title = cleanProductTitle(chunk);
    if (!title || isJunkProductTitle(title)) continue;

    lines.push({
      description: title,
      quantity: qty,
      unitValueUsd: span.amount,
      lineTotalUsd: Math.round(span.amount * qty * 100) / 100,
    });
    if (lines.length >= 12) break;
  }

  const merchandise = lines.filter(
    (l) =>
      !/^(shipping|handling|tax|estimated\s+tax|free\s+shipping)/i.test(l.description) &&
      (l.unitValueUsd ?? 0) > 0,
  );
  if (merchandise.length > 0) return merchandise;
  if (lines.length > 0) return lines;

  for (const label of extractItemLabels(text, isAmazon)) {
    lines.push({
      description: label,
      quantity: 1,
      unitValueUsd: null,
      lineTotalUsd: null,
    });
  }
  return lines;
}

function extractSoldByColonLines(flat: string): InvoiceParseLine[] {
  const markers: Array<{ index: number; label: string }> = [];
  const deliveredRe = /\bDelivered\s+([A-Za-z]+)\s+(\d{1,2})\b/gi;
  let dm: RegExpExecArray | null;
  while ((dm = deliveredRe.exec(flat)) != null) {
    markers.push({
      index: dm.index,
      label: `Delivered ${dm[1]} ${dm[2]}`,
    });
  }

  function groupAt(pos: number): { index: number; label: string | null } {
    if (markers.length === 0) return { index: 0, label: null };
    let idx = 0;
    for (let i = 0; i < markers.length; i++) {
      if (markers[i].index <= pos) idx = i;
    }
    return { index: idx, label: markers[idx]?.label ?? null };
  }

  const lines: InvoiceParseLine[] = [];
  const soldByRe =
    /(.+?)\s+Sold\s+by:\s*[^$]{0,220}?\$\s*([0-9]+(?:\.[0-9]{2})?)/gi;
  let sm: RegExpExecArray | null;
  while ((sm = soldByRe.exec(flat)) != null) {
    const title = cleanProductTitle(sm[1]);
    const amount = parseMoney(sm[2]);
    if (!title || amount == null || amount <= 0) continue;
    if (isJunkProductTitle(title)) continue;
    // Use end of match (at $price) so "Delivered …" inside the title span counts
    const group = groupAt(sm.index + sm[0].length - 1);
    lines.push({
      description: title,
      quantity: 1,
      unitValueUsd: amount,
      lineTotalUsd: amount,
      deliveryGroupIndex: group.index,
      deliveryLabel: group.label,
    });
    if (lines.length >= 12) break;
  }
  return lines;
}

function extractQtyPriceLines(flat: string): InvoiceParseLine[] {
  const lines: InvoiceParseLine[] = [];
  const re =
    /(?:^|[\n.])\s*([A-Za-z0-9][^$]{10,160}?)\s+Qty\.?\s*(\d+)\s+\$\s*([0-9]+(?:\.[0-9]{2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat)) != null) {
    const title = cleanProductTitle(m[1]);
    const qty = Number(m[2]) || 1;
    const amount = parseMoney(m[3]);
    if (!title || amount == null || amount <= 0) continue;
    if (isJunkProductTitle(title)) continue;
    lines.push({
      description: title,
      quantity: qty,
      unitValueUsd: amount,
      lineTotalUsd: Math.round(amount * qty * 100) / 100,
    });
    if (lines.length >= 12) break;
  }
  return lines;
}

function extractItemLabels(text: string, isAmazon: boolean): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

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
    if (!/[A-Za-z]{4,}/.test(line)) continue;
    if (isAmazon && /\bqty\b|\bquantity\b|of\s+\d+\s*$/i.test(line) && line.length < 20) {
      continue;
    }
    const words = line.split(' ').filter((w) => w.length > 2);
    if (words.length < 2) continue;
    if (TOTAL_LABELS.test(line) || WEAK_TOTALS.test(line)) continue;
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
