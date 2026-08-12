import { parseRetailInvoiceText } from './parseRetailInvoiceText';
import { matchWarehouseFromShipTo } from './matchWarehouseFromShipTo';

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

const AMAZON_PRINT = `
Order Summary Order placed July 9, 2026 Order # 111-7351808-5310605 Ship to Sadiki Thomas(BSHPD) 1807 SW 31ST AVE BSHPD10859 HALLANDALE, FL 33009-2019 United States Mastercard ending in 8606 Payment method View related transactions Order Summary Item(s) Subtotal: $146.86 Shipping & Handling: $6.99 Free Shipping: -$6.99 Total before tax: $146.86 Estimated tax to be collected: $10.28 Grand Total: $157.14 Delivered July 13 It was handed directly to a receptionist or someone at a front desk. Lea fl ai Olive Oil Dispenser Bottle, 2 Pcs Glass Olive Oil Dispenser and Vinegar Dispenser Set with 2 Stainless Steel Pourers, 4 Labels,1 Brush and 1 Funnel Oil Bottles for Kitchen (500ml) Sold by: QIMIAO SHOP Supplied by: QIMIAO SHOP , Other Return or replace items: Eligible through August 11, 2026 $12.99 Tallew 4 Pcs O ffi ce Chair Covers Set Computer Universal Protective Stretchable Chair Seat Covers Desk Armrest Slipcovers Pads O ffi ce Cushion Backrest for Rotating (XL,Black) Sold by: Yungmaii Return or replace items: Eligible through August 11, 2026 $14.99 Cordless Portable Washer, 1100 PSI Battery Operated Washer with All-Copper Motor, Battery, 23FT Hose, Storage Bag; Handheld Washer; Lightweight Car Washer for Home, Garden (Resilient Orange) Sold by: Wavechain Tech Return or replace items: Eligible through August 11, 2026 $79.99 Turtle Wax Hybrid Solutions Ceramic Spray Coating, High Shine Car Wax, O ff ers Durable Paint Protection, Extreme Water Beading Action, Safe for Glass, Wheels, Trim and More, 16 oz (Pack of 2) Sold by: Amazon.com Supplied by: Other Return or replace items: Eligible through August 11, 2026 $25.90 Delivered July 14 Lea fl ai Olive Oil Dispenser Bottle, 2 Pcs Glass Olive Oil Dispenser and Vinegar Dispenser Set with 2 Stainless Steel Pourers, 4 Labels,1 Brush and 1 Funnel Oil Bottles for Kitchen (500ml) Sold by: QIMIAO SHOP Supplied by: QIMIAO SHOP , Other Return or replace items: Eligible through August 13, 2026 $12.99
`;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const r = parseRetailInvoiceText(SAMPLE);
assert(r.retailer === 'Amazon', `retailer=${r.retailer}`);
assert(r.declaredValueUsd === 62.98, `total=${r.declaredValueUsd}`);
assert(r.weightLbs === 1.2, `weight=${r.weightLbs}`);
assert(r.confidence === 'high' || r.confidence === 'medium', `confidence=${r.confidence}`);
assert(r.lines.some((l) => /echo/i.test(l.description)), `lines=${JSON.stringify(r.lines)}`);
assert(r.externalOrderNumber === '112-1234567-8901234', `order=${r.externalOrderNumber}`);

const summaryTrap = parseRetailInvoiceText(
  'Order Summary Grand Total: $10.00 Order # 111-7351808-5310605',
);
assert(
  summaryTrap.externalOrderNumber === '111-7351808-5310605',
  `summaryTrap=${summaryTrap.externalOrderNumber}`,
);

const suiteShip = parseRetailInvoiceText(
  'Ship to Sadiki Thomas 1807 SW 31ST AVE BSHPD10859 HALLANDALE FL Order # 111-7351808-5310605 Grand Total: $157.14',
);
assert(suiteShip.suiteCode === 'BSHPD10859', `suite=${suiteShip.suiteCode}`);
assert(suiteShip.externalOrderNumber === '111-7351808-5310605', 'order still ok with suite');
assert(r.lines.length >= 2, `lines=${r.lines.length}`);
assert(r.orderTotalUsd === 62.98, `orderTotal=${r.orderTotalUsd}`);

const amazon = parseRetailInvoiceText(AMAZON_PRINT);
assert(amazon.suiteCode === 'BSHPD10859', `amazon suite=${amazon.suiteCode}`);
assert(amazon.externalOrderNumber === '111-7351808-5310605', `amazon order=${amazon.externalOrderNumber}`);
assert(amazon.declaredValueUsd === 157.14, `amazon total=${amazon.declaredValueUsd}`);
assert(amazon.shipTo?.postalCode === '33009', `shipTo zip=${amazon.shipTo?.postalCode}`);
assert(
  /1807/i.test(amazon.shipTo?.streetLine || '') && /31/i.test(amazon.shipTo?.streetLine || ''),
  `shipTo street=${amazon.shipTo?.streetLine}`,
);
assert(amazon.lines.length === 5, `amazon lines=${amazon.lines.length} ${JSON.stringify(amazon.lines)}`);
assert(
  amazon.lines.some((l) => /turtle wax/i.test(l.description) && l.unitValueUsd === 25.9),
  `turtle wax missing: ${JSON.stringify(amazon.lines)}`,
);
assert(
  !amazon.lines.some(
    (l) => /^amazon\.com$/i.test(l.description) || /return or replace/i.test(l.description),
  ),
  `junk titles: ${JSON.stringify(amazon.lines.map((l) => l.description))}`,
);
assert(
  amazon.lines.some((l) => /chair covers/i.test(l.description) && l.unitValueUsd === 14.99),
  `chair covers: ${JSON.stringify(amazon.lines)}`,
);
assert(
  amazon.lines.some((l) => /leaflai|olive oil/i.test(l.description)),
  `oil dispenser: ${JSON.stringify(amazon.lines)}`,
);

const wh = matchWarehouseFromShipTo(amazon.shipTo, [
  {
    id: 'cs-1',
    name: 'Complete Sourcing USA',
    address_line: '1807 SW 31st Ave',
    city: 'Hallandale Beach, FL 33009',
    country_code: 'US',
  },
  {
    id: 'other-1',
    name: 'Reliable Courier Jamaica',
    address_line: '10250 NW 89th Ave, STE 18',
    city: 'Medley, FL 33178',
    country_code: 'US',
  },
]);
assert(wh?.facilityId === 'cs-1', `warehouse match=${JSON.stringify(wh)}`);
assert((wh?.score ?? 0) >= 70, `warehouse score=${wh?.score}`);


const empty = parseRetailInvoiceText('');
assert(empty.confidence === 'none', 'empty should be none');

const imageWarn = parseRetailInvoiceText('   ');
assert(imageWarn.warnings.length > 0, 'blank text warns');

console.log('parseRetailInvoiceText selfcheck OK', {
  retailer: r.retailer,
  declaredValueUsd: r.declaredValueUsd,
  weightLbs: r.weightLbs,
  description: r.description,
  externalOrderNumber: r.externalOrderNumber,
  lines: r.lines.length,
  amazonLines: amazon.lines.map((l) => `${l.unitValueUsd}:${l.description.slice(0, 40)}`),
});
