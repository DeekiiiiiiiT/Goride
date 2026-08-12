import type { InvoiceShipToHint } from './types';

export type WarehouseFacilityLike = {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  address_line?: unknown;
  city?: unknown;
  country_code?: unknown;
};

/** Collapse street noise so "1807 SW 31st Avenue" ≈ "1807 SW 31ST AVE". */
export function normalizeAddressKey(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/\b(BSHPD|CS-?)[A-Z0-9-]{2,}\b/g, ' ')
    .replace(/\b(STREET|ST\.?)\b/g, 'ST')
    .replace(/\b(AVENUE|AVE\.?)\b/g, 'AVE')
    .replace(/\b(BOULEVARD|BLVD\.?)\b/g, 'BLVD')
    .replace(/\b(DRIVE|DR\.?)\b/g, 'DR')
    .replace(/\b(ROAD|RD\.?)\b/g, 'RD')
    .replace(/\b(SUITE|STE\.?|UNIT|APT\.?|#)\b/g, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function postalFromText(raw: string): string | null {
  const m = String(raw || '').match(/\b(\d{5})(?:-\d{4})?\b/);
  return m?.[1] ?? null;
}

function houseNumber(raw: string): string | null {
  const m = normalizeAddressKey(raw).match(/^(\d+)\b/);
  return m?.[1] ?? null;
}

function scoreFacility(shipTo: InvoiceShipToHint, facility: WarehouseFacilityLike): number {
  const addr = normalizeAddressKey(String(facility.address_line || ''));
  const cityBlob = normalizeAddressKey(
    `${facility.city || ''} ${facility.address_line || ''} ${facility.name || ''}`,
  );
  if (!addr && !cityBlob) return 0;

  let score = 0;
  const shipStreet = normalizeAddressKey(shipTo.streetLine || '');
  const shipHouse = houseNumber(shipTo.streetLine || '');
  const facHouse = houseNumber(String(facility.address_line || ''));
  const shipZip = shipTo.postalCode || postalFromText(shipTo.streetLine || '');
  const facZip = postalFromText(`${facility.city || ''} ${facility.address_line || ''}`);

  if (shipZip && facZip && shipZip === facZip) score += 50;
  if (shipHouse && facHouse && shipHouse === facHouse) score += 35;

  if (shipStreet && addr) {
    const shipTokens = new Set(shipStreet.split(' ').filter((t) => t.length > 1 && t !== shipHouse));
    const addrTokens = new Set(addr.split(' ').filter((t) => t.length > 1 && t !== facHouse));
    let overlap = 0;
    for (const t of shipTokens) if (addrTokens.has(t)) overlap += 1;
    score += Math.min(30, overlap * 10);
  }

  const cityNeedle = normalizeAddressKey(shipTo.city || '').replace(/\bBEACH\b/g, '').trim();
  if (cityNeedle && cityBlob.includes(cityNeedle.split(' ')[0] || cityNeedle)) score += 10;

  if (shipTo.state) {
    const st = shipTo.state.toUpperCase();
    if (cityBlob.includes(` ${st} `) || cityBlob.endsWith(` ${st}`) || cityBlob.includes(`${st} `)) {
      score += 5;
    }
  }

  return score;
}

/**
 * Match invoice ship-to to an org warehouse copied from Dominion intake catalog.
 * Requires a clear winner (ZIP + street number is enough for Complete Sourcing).
 */
export function matchWarehouseFromShipTo(
  shipTo: InvoiceShipToHint | null | undefined,
  facilities: WarehouseFacilityLike[],
): { facilityId: string; score: number; name: string } | null {
  if (!shipTo || !facilities.length) return null;
  if (!shipTo.streetLine && !shipTo.postalCode) return null;

  let best: { facilityId: string; score: number; name: string } | null = null;
  let second = 0;

  for (const f of facilities) {
    const id = String(f.id || '');
    if (!id) continue;
    const score = scoreFacility(shipTo, f);
    if (!best || score > best.score) {
      second = best?.score ?? 0;
      best = { facilityId: id, score, name: String(f.name || f.code || id) };
    } else if (score > second) {
      second = score;
    }
  }

  // Need ZIP+house (~85) or strong street overlap; reject ambiguous ties
  if (!best || best.score < 70) return null;
  if (second > 0 && best.score - second < 15) return null;
  return best;
}
