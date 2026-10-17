/** Day-one adapter is the manual checklist. Later levels read the same cart. */

export type ChecklistStep = {
  id: string;
  label: string;
  copyText?: string;
  /** Nested ticks for engine buyer tickets (site step order). */
  children?: ChecklistStep[];
};

export type CartLine = {
  name: string;
  quantity: number;
  sku: string | null;
  options: string[];
};

function optionLabel(mod: { name?: string; priceAdjustment?: number }): string {
  const name = String(mod.name || "");
  const extra = Number(mod.priceAdjustment) || 0;
  if (!name) return "";
  return extra > 0 ? `${name} (+J$${extra})` : name;
}

type BuyerTicketStep = {
  step?: number;
  label?: string;
  value?: string;
  copyText?: string;
};

type OrderItem = {
  name?: string;
  quantity?: number;
  source_sku?: string | null;
  modifiers?: Array<{ name?: string; priceAdjustment?: number }>;
  note?: string;
  buyerTicket?: {
    title?: string;
    quantity?: number;
    steps?: BuyerTicketStep[];
    copyAll?: string;
  };
};

export function manualChecklist(input: {
  orderItems: OrderItem[];
  pickupCode: string;
  phone?: string | null;
  orderUrl?: string | null;
}): ChecklistStep[] {
  const steps: ChecklistStep[] = [
    { id: "open", label: "Open the restaurant ordering page", copyText: input.orderUrl ?? undefined },
    { id: "type", label: "Order type: carry-out" },
    { id: "name", label: "Pickup name", copyText: input.pickupCode },
  ];
  if (input.phone) steps.push({ id: "phone", label: "Phone", copyText: input.phone });
  input.orderItems.forEach((item, index) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const ticket = item.buyerTicket;
    if (ticket?.steps?.length) {
      const title = ticket.title || item.name || "Item";
      const children = ticket.steps.map((step, stepIndex) => ({
        id: `item-${index}-step-${stepIndex}`,
        label: `${step.step ?? stepIndex + 1}. ${step.label || ""}: ${step.value || ""}`,
        copyText: step.copyText || `${step.label}: ${step.value}`,
      }));
      steps.push({
        id: `item-${index}`,
        label: `Item ${index + 1} of ${input.orderItems.length} · ${title}${qty > 1 ? ` (×${qty})` : ""}`,
        copyText: ticket.copyAll || children.map((c) => c.copyText).join("\n"),
        children,
      });
      return;
    }
    const options = (item.modifiers ?? []).map((mod) => optionLabel(mod)).filter(Boolean);
    const label = `${qty}× ${item.name || "Item"}${options.length ? ` — ${options.join(", ")}` : ""}`;
    steps.push({ id: `item-${index}`, label, copyText: label });
  });
  return steps;
}

/** L1 fills the cart. L3 may run only when the store terms allow it. Neither may pay. */
export function automationAllowed(store: {
  automation_level?: string | null;
  tos_allows_automation?: boolean | null;
}, level: "L1" | "L3"): boolean {
  if (level === "L1") return store.automation_level === "L1" || store.automation_level === "L3";
  return store.automation_level === "L3" && store.tos_allows_automation === true;
}

export function cartPayload(orderItems: OrderItem[]): CartLine[] {
  return orderItems.map((item) => ({
    name: String(item.name || ""),
    quantity: Math.max(1, Number(item.quantity) || 1),
    sku: item.source_sku ? String(item.source_sku) : null,
    options: item.buyerTicket?.steps?.length
      ? item.buyerTicket.steps.map((s) => s.copyText || `${s.label}: ${s.value}`)
      : (item.modifiers ?? []).map((mod) => optionLabel(mod)).filter(Boolean),
  }));
}
