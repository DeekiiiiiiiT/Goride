/** Format a JMD amount for display (no currency symbol). */
export function formatJmd(amount: number): string {
  return amount.toLocaleString('en-JM');
}
