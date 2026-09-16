/** Z-2: seed lookup only when the remittance account does not exist yet. */
export function needsThresholdSeed(account: unknown): boolean {
  return account == null;
}
