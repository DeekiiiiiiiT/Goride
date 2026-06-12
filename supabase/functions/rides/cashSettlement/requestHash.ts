export interface SettlementRequestPayload {
  cash_received_minor: number;
  tip_received_minor?: number;
}

export async function hashSettlementRequest(payload: SettlementRequestPayload): Promise<string> {
  const normalized = JSON.stringify({
    cash_received_minor: Math.floor(Number(payload.cash_received_minor) || 0),
    tip_received_minor: Math.floor(Number(payload.tip_received_minor ?? 0) || 0),
  });
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
