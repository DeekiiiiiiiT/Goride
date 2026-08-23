/** Auth admin patch applied when a courier is unsuspended or reactivated. */
export const COURIER_UNSUSPEND_AUTH_PATCH = { ban_duration: "none" } as const;

export type ActiveCustomerPersona = {
  id: string;
  account_status: string;
  email?: string | null;
};

export function isActiveCustomerPersona(
  row: ActiveCustomerPersona | null | undefined,
): boolean {
  if (!row) return false;
  return row.account_status === "active" || row.account_status === "suspended";
}

/** Returns a cross-persona warning payload when suspend would auth-ban a shared customer account. */
export function buildCourierSuspendCrossPersonaWarning(
  customer: ActiveCustomerPersona,
  confirmCrossPersona: boolean,
): { error: string; message: string; customer: ActiveCustomerPersona } | null {
  if (!isActiveCustomerPersona(customer)) return null;
  if (confirmCrossPersona) return null;
  return {
    error: "cross_persona_warning",
    message:
      "This courier also has a Rush customer account. Suspending will lock them out of ordering food until unsuspended.",
    customer: {
      id: customer.id,
      account_status: customer.account_status,
      email: customer.email ?? null,
    },
  };
}
