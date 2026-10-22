export const COMMUTE_ROUTING_UNAVAILABLE_NOTE =
  'Routing unavailable — kilometres left unexplained';

export function commuteRouteStatus(args: {
  homeMissing: boolean;
  routingOk: boolean;
  legs: number;
  routedLegs: number;
}): { confidence: 'measured' | 'estimated' | 'none'; note?: string } {
  if (args.homeMissing) return { confidence: 'none' };
  const legs = Math.max(0, args.legs);
  const routed = Math.max(0, args.routedLegs);
  if (!args.routingOk || (legs > 0 && routed === 0)) {
    return { confidence: 'none', note: COMMUTE_ROUTING_UNAVAILABLE_NOTE };
  }
  if (routed < legs) {
    return { confidence: 'estimated', note: 'Some commute legs could not be routed' };
  }
  return { confidence: 'measured' };
}
