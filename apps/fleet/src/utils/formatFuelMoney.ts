/**
 * Shared money formatter for Consumption Reconciliation / fuel surfaces.
 * JMD business — never hardcode USD glyphs on fuel spend.
 */
import { formatJMD } from './formatJMD';

export function formatFuelMoney(value: number, decimals = 2): string {
  return formatJMD(Number(value) || 0, decimals);
}
