import { flattenSelections, selectionMatches } from './conditions.ts';
import type {
  BuyerTicket,
  BuyerTicketStep,
  MenuProduct,
  MenuSnapshot,
  OptionGroup,
  OrderLine,
  OrderSelection,
} from './types.ts';

function optionLabel(group: OptionGroup, optionId: string): string {
  const opt = group.options.find((o) => o.id === optionId);
  return opt?.sourceLabel || opt?.name || optionId;
}

function formatPick(group: OptionGroup, pick: OrderSelection): string {
  let value = optionLabel(group, pick.optionId);
  if (pick.portion && pick.portion !== 'normal') {
    value += ` — ${pick.portion[0].toUpperCase()}${pick.portion.slice(1)}`;
  }
  if (pick.placement && pick.placement !== 'whole') {
    value += ` (${pick.placement})`;
  }
  if (pick.qty && pick.qty > 1) value += ` ×${pick.qty}`;
  if (pick.children?.length) {
    for (const child of pick.children) {
      // nested labels appended briefly
      value += ` / ${child.optionId}`;
    }
  }
  return value;
}

export function buildBuyerTicket(
  snapshot: MenuSnapshot,
  product: MenuProduct,
  line: OrderLine,
  groups: Map<string, OptionGroup>,
): BuyerTicket {
  const flat = flattenSelections(line.selections);
  const steps: BuyerTicketStep[] = [];
  const links = [...product.groupLinks].sort((a, b) => a.sort - b.sort);

  for (const link of links) {
    const group = groups.get(link.groupId);
    if (!group) continue;
    if (!selectionMatches(group.condition, flat)) continue;
    const picks = line.selections.filter((s) => s.groupId === group.id);
    if (!picks.length) continue;
    const stepNum = group.sourceStep ?? steps.length + 1;
    const label = group.sourceLabel || group.name;
    const value = picks.map((p) => {
      let text = formatPick(group, p);
      if (p.children?.length) {
        for (const child of p.children) {
          const nested = groups.get(
            group.options.find((o) => o.id === p.optionId)?.nestedGroupId || '',
          );
          if (nested) text = `${formatPick(group, { ...p, children: undefined })} · ${formatPick(nested, child)}`;
        }
      }
      return text;
    }).join(' · ');
    steps.push({
      step: stepNum,
      groupId: group.id,
      label,
      value,
      copyText: `${label}: ${value}`,
    });
  }

  steps.sort((a, b) => a.step - b.step);
  const title = product.sourceLabel || product.name;
  const qty = Math.max(1, Math.round(line.quantity || 1));
  const copyAll = [
    `${title}${qty > 1 ? ` (×${qty})` : ''}`,
    ...steps.map((s) => `${s.step}. ${s.copyText}`),
  ].join('\n');

  return { productId: product.id, title, quantity: qty, steps, copyAll };
}
