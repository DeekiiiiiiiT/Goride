/** Short cash: the courier keeps their full share. Platform and restaurant share what is left. */

export type ShortCollection = {
  bagMinor: number;
  platformMinor: number;
  merchantMinor: number;
  courierMinor: number;
};

export function scaleShortCollection(input: {
  bagMinor: number;
  platformMinor: number;
  merchantMinor: number;
  courierMinor: number;
  collectedMinor: number;
}): ShortCollection {
  const bag = Math.max(0, Math.round(input.bagMinor));
  const platform = Math.max(0, Math.round(input.platformMinor));
  const merchant = Math.max(0, Math.round(input.merchantMinor));
  const courier = Math.max(0, Math.round(input.courierMinor));
  const collected = Math.max(0, Math.min(bag, Math.round(input.collectedMinor)));
  if (collected >= bag) {
    return { bagMinor: bag, platformMinor: platform, merchantMinor: merchant, courierMinor: courier };
  }
  const courierKept = Math.min(courier, collected);
  const remainder = collected - courierKept;
  const remit = platform + merchant;
  let platformOut = 0;
  let merchantOut = 0;
  if (remit > 0 && remainder > 0) {
    platformOut = Math.min(remainder, Math.round(platform * remainder / remit));
    merchantOut = remainder - platformOut;
  }
  return {
    bagMinor: collected,
    platformMinor: platformOut,
    merchantMinor: merchantOut,
    courierMinor: courierKept,
  };
}
