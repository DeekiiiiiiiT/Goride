/** Server allowlist for arrears payment methods (mirrors client demo + saved prefixes). */
export type ArrearsPaymentSource = "demo_card" | "demo_lynk";

export function resolveArrearsPaymentMethod(paymentMethodId: string): {
  valid: boolean;
  paymentSource?: ArrearsPaymentSource;
  shortfallPaymentMethod?: "card" | "lynk";
} {
  const id = paymentMethodId.trim();
  if (!id || id === "cash") {
    return { valid: false };
  }

  if (id === "lynk" || id.startsWith("saved_lynk_")) {
    return { valid: true, paymentSource: "demo_lynk", shortfallPaymentMethod: "lynk" };
  }

  if (id === "apple_pay" || id === "visa_1212" || id.startsWith("saved_card_")) {
    return { valid: true, paymentSource: "demo_card", shortfallPaymentMethod: "card" };
  }

  return { valid: false };
}
