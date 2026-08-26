/**
 * Attribute a toll transaction to a plaza.
 *
 * The ledger carries a real `plazaId` foreign key. Everything used to ignore it
 * and re-derive the plaza by matching free text against plaza names, which is
 * why renamed and differently-spelled plazas charted as "Unknown Plaza". The id
 * is now the join; the text match survives only as a fallback for rows that were
 * imported before attribution existed.
 */
import type { TollPlaza } from '../types/toll';

export type PlazaMatchSource = 'id' | 'name' | 'gps' | 'none';

export interface PlazaMatch {
  plaza: TollPlaza | null;
  source: PlazaMatchSource;
}

export interface PlazaMatchInput {
  plazaId?: string | null;
  vendor?: string | null;
  description?: string | null;
  metadata?: Record<string, any> | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function resolveTollPlaza(tx: PlazaMatchInput, plazas: TollPlaza[]): PlazaMatch {
  if (!plazas?.length) return { plaza: null, source: 'none' };

  const explicitId = tx.plazaId || tx.metadata?.plazaId;
  if (explicitId) {
    const byId = plazas.find(p => p.id === explicitId);
    if (byId) return { plaza: byId, source: 'id' };
  }

  const vendor = (tx.vendor || '').toLowerCase().trim();
  const desc = (tx.description || '').toLowerCase().trim();
  const searchText = `${vendor} ${desc}`;

  for (const plaza of plazas) {
    const name = plaza.name.toLowerCase();
    if (vendor === name || desc.includes(name) || searchText.includes(name)) {
      return { plaza, source: 'name' };
    }
  }

  for (const plaza of plazas) {
    const words = plaza.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const hits = words.filter(w => searchText.includes(w)).length;
    if (words.length > 0 && hits >= Math.ceil(words.length * 0.6)) {
      return { plaza, source: 'name' };
    }
  }

  const txLat = tx.metadata?.lat ?? tx.metadata?.latitude;
  const txLng = tx.metadata?.lng ?? tx.metadata?.longitude;
  if (txLat != null && txLng != null) {
    let closest: TollPlaza | null = null;
    let closestDist = Infinity;
    for (const plaza of plazas) {
      if (!plaza.location?.lat || !plaza.location?.lng) continue;
      const dist = haversineKm(txLat, txLng, plaza.location.lat, plaza.location.lng);
      const radiusKm = (plaza.geofenceRadius || 500) / 1000;
      if (dist < radiusKm && dist < closestDist) {
        closestDist = dist;
        closest = plaza;
      }
    }
    if (closest) return { plaza: closest, source: 'gps' };
  }

  return { plaza: null, source: 'none' };
}
