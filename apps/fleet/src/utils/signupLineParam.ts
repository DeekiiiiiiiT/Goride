/**
 * Parse signup ?line= query param into initial service lines.
 */
import type { ServiceLine } from '../components/auth/BusinessConfigContext';

export function parseSignupLineParam(param: string | null | undefined): ServiceLine | undefined {
  if (param === 'rush_delivery' || param === 'rideshare') return param;
  return undefined;
}

export function initialServiceLinesFromSignupLine(
  line: ServiceLine | undefined,
): ServiceLine[] {
  if (line === 'rush_delivery') return ['rush_delivery'];
  if (line === 'rideshare') return ['rideshare'];
  return ['rideshare'];
}
