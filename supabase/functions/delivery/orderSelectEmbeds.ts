/** PostgREST embed hints — disambiguate orders ↔ customers when multiple FK paths exist. */
export const ORDER_CUSTOMER_EMBED =
  "customer:customers!orders_customer_id_fkey(id, name, phone)";

export const ORDER_CUSTOMER_EMBED_MINIMAL =
  "customer:customers!orders_customer_id_fkey(name, phone)";

export function isCustomerEmbedError(error: { message?: string } | null): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("more than one relationship") || message.includes("could not embed");
}
