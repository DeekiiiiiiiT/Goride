/** Customer Rush balance. Debt age starts when the unpaid balance began, not when the account was opened. */

export type WalletMovement = { at: string; amountMinor: number; eventType?: string; reason?: string };

export function debtAgeDaysFromMovements(movements: WalletMovement[], now = Date.now()): number {
  const sorted = [...movements].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let balance = 0;
  let started: number | null = null;
  for (const row of sorted) {
    const next = balance + row.amountMinor;
    if (balance <= 0 && next > 0) started = Date.parse(row.at);
    if (next <= 0) started = null;
    balance = next;
  }
  if (balance <= 0 || started == null || !Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((now - started) / 86_400_000));
}

type Db = { schema: (name: string) => any };

export async function loadCustomerWallet(db: Db, customerId: string): Promise<{
  balanceMajor: number;
  creditMajor: number;
  debtAgeDays: number;
  history: Array<{ at: string; eventType: string; reason: string; amountMajor: number }>;
}> {
  const { data: account } = await db.schema("rush_money").from("accounts")
    .select("id, balance_minor")
    .eq("kind", "customer_wallet")
    .eq("party_id", customerId)
    .eq("component", "")
    .maybeSingle();
  const balanceMinor = Number(account?.balance_minor || 0);
  const balanceMajor = balanceMinor / 100;
  if (!account?.id) {
    return { balanceMajor: 0, creditMajor: 0, debtAgeDays: 0, history: [] };
  }
  const { data: lineRows } = await db.schema("rush_money").from("lines")
    .select("amount_minor, journal_id")
    .eq("account_id", account.id);
  const lines = (lineRows || []) as Array<{ amount_minor?: number; journal_id?: string }>;
  const journalIds = [...new Set(lines.map((row) => String(row.journal_id || "")).filter(Boolean))];
  const { data: journalRows } = journalIds.length
    ? await db.schema("rush_money").from("journals")
      .select("id, created_at, event_type, reason")
      .in("id", journalIds)
    : { data: [] };
  const journals = new Map((journalRows || []).map((row: { id?: string }) => [String(row.id), row]));
  const movements: WalletMovement[] = lines.flatMap((line) => {
    const journal = journals.get(String(line.journal_id)) as { created_at?: string; event_type?: string; reason?: string } | undefined;
    if (!journal?.created_at) return [];
    return [{
      at: String(journal.created_at),
      amountMinor: Number(line.amount_minor || 0),
      eventType: String(journal.event_type || ""),
      reason: String(journal.reason || ""),
    }];
  });
  const history = [...movements]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 40)
    .map((row) => ({
      at: row.at,
      eventType: row.eventType || "",
      reason: row.reason || (row.amountMinor > 0 ? "Balance added" : "Balance paid"),
      amountMajor: row.amountMinor / 100,
    }));
  return {
    balanceMajor,
    creditMajor: balanceMajor < 0 ? Math.abs(balanceMajor) : 0,
    debtAgeDays: debtAgeDaysFromMovements(movements),
    history,
  };
}
