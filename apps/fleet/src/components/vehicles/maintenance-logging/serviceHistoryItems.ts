import type { LineItemDraft } from "../../../types/maintenance";
import { costRecorded, itemAmount, money, qtyWithUnit } from "./log-service/itemsUsed";

/** "Throttle body cleaner (1 can, J$ 1,200) · Shop rags (1 pack, cost not recorded)". Empty when none. */
export function itemsUsedText(items: LineItemDraft[] | undefined | null, currency?: string | null): string {
  if (!items?.length) return "";
  return items
    .map((it) => {
      const cost = costRecorded(it) ? money(currency, it.amount ?? itemAmount(it)) : "cost not recorded";
      return `${it.itemName} (${qtyWithUnit(it)}, ${cost})`;
    })
    .join(" · ");
}
