import type { MenuSnapshot } from './types.ts';

export type LocationOverride = {
  targetKind: 'product' | 'option' | 'section';
  targetId: string;
  price?: number | null;
  isAvailable?: boolean | null;
};

/** Apply per-location price/availability on top of a brand snapshot (clone). */
export function applyLocationOverrides(snapshot: MenuSnapshot, overrides: LocationOverride[]): MenuSnapshot {
  const next: MenuSnapshot = structuredClone(snapshot);
  for (const row of overrides) {
    if (row.targetKind === 'product') {
      const product = next.products.find((p) => p.id === row.targetId);
      if (!product) continue;
      if (row.price != null) product.basePrice = row.price;
      if (row.isAvailable === false) product.archivedAt = product.archivedAt || new Date().toISOString();
    }
    if (row.targetKind === 'option') {
      for (const group of next.groups) {
        const opt = group.options.find((o) => o.id === row.targetId);
        if (!opt) continue;
        if (row.price != null) opt.price = row.price;
        if (row.isAvailable != null) opt.isAvailable = row.isAvailable;
      }
    }
  }
  return next;
}
