/** Integer minor-unit boundary for Delivery remittance (Layer A′). */

export function toMinor(jmd: number): number {
  if (!Number.isFinite(jmd)) return 0;
  return Math.round(jmd * 100);
}

export function fromMinor(minor: number): number {
  if (!Number.isFinite(minor)) return 0;
  return Math.round(minor) / 100;
}

export function collectIdempotencyKey(orderId: string): string {
  return `cod:collect:v1:${orderId}`;
}

export function settleIdempotencyKey(settlementId: string): string {
  return `cod:settle:v1:${settlementId}`;
}

export function reverseIdempotencyKey(eventId: string): string {
  return `cod:reverse:v1:${eventId}`;
}

export function writeOffIdempotencyKey(clientKey: string): string {
  return clientKey.startsWith("cod:writeoff:")
    ? clientKey
    : `cod:writeoff:v1:${clientKey}`;
}

