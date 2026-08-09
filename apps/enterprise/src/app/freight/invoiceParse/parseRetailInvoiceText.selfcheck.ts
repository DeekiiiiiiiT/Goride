import { parseRetailInvoiceText } from './parseRetailInvoiceText';

/** Lightweight fixture checks — run via: npx tsx src/app/freight/invoiceParse/parseRetailInvoiceText.selfcheck.ts */
const SAMPLE = `
Final Details for Order #112-1234567-8901234
Sold by Amazon.com Services LLC
Echo Dot (5th Gen) Smart speaker with Alexa
Qty 1 $49.99
USB-C Charging Cable 6ft
Qty 1 $12.99
Items Subtotal: $62.98
Shipping & Handling: $0.00
Grand Total: $62.98
Shipment weight: 1.2 lb
`;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const r = parseRetailInvoiceText(SAMPLE);
assert(r.retailer === 'Amazon', `retailer=${r.retailer}`);
assert(r.declaredValueUsd === 62.98, `total=${r.declaredValueUsd}`);
assert(r.weightLbs === 1.2, `weight=${r.weightLbs}`);
assert(r.confidence === 'high' || r.confidence === 'medium', `confidence=${r.confidence}`);
assert((r.description || '').toLowerCase().includes('echo'), `desc=${r.description}`);

const empty = parseRetailInvoiceText('');
assert(empty.confidence === 'none', 'empty should be none');

const imageWarn = parseRetailInvoiceText('   ');
assert(imageWarn.warnings.length > 0, 'blank text warns');

console.log('parseRetailInvoiceText selfcheck OK', {
  retailer: r.retailer,
  declaredValueUsd: r.declaredValueUsd,
  weightLbs: r.weightLbs,
  description: r.description,
});
