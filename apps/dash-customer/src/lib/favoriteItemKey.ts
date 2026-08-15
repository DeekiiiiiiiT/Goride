export type FavoriteItemKey = `${string}:${string}`;

/** Stable local + API key for a merchant menu item. */
export function toFavoriteItemKey(merchantId: string, itemId: string): FavoriteItemKey {
  return `${merchantId}:${itemId}` as FavoriteItemKey;
}

/** Split `merchantId:itemId` (itemId may contain colons — only first split). */
export function parseFavoriteItemKey(key: string): { merchantId: string; itemId: string } | null {
  const sep = key.indexOf(':');
  if (sep <= 0 || sep === key.length - 1) return null;
  return {
    merchantId: key.slice(0, sep),
    itemId: key.slice(sep + 1),
  };
}
