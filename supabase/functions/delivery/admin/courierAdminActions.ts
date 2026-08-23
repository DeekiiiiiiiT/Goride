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

/** Informational cross-persona notice — courier suspend no longer auth-bans the customer app. */
export function buildCourierSuspendCrossPersonaWarning(
  customer: ActiveCustomerPersona,
  confirmCrossPersona: boolean,
): { error: string; message: string; customer: ActiveCustomerPersona } | null {
  if (!isActiveCustomerPersona(customer)) return null;
  if (confirmCrossPersona) return null;
  return {
    error: "cross_persona_warning",
    message:
      "This courier also has a Rush customer account. Suspending blocks courier work only — they can still order food. Courier sessions will be revoked and they cannot accept deliveries.",
    customer: {
      id: customer.id,
      account_status: customer.account_status,
      email: customer.email ?? null,
    },
  };
}
