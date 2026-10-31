export type FindPartsScreenData = {
  plate: string;
  plateSecondary: string;
  vehicleLabel: string;
  vehicleLabelSecondary: string;
  priceLabel: string;
  priceAltLabel: string;
  pricePlain: string;
  quoteRef: string;
  requestRef: string;
  partBrand: string;
  partNumber: string;
  partNumberAlt: string;
  hubLabel: string;
};

export function buildFindPartsScreenData(input: {
  plate?: string;
  vehicleLabel?: string;
  priceJmd?: number | null;
  partNumber?: string;
  quoteRef?: string;
}): FindPartsScreenData {
  const price = input.priceJmd != null && input.priceJmd > 0 ? `J$ ${input.priceJmd.toLocaleString()}` : "No price yet";
  return {
    plate: input.plate || "—",
    plateSecondary: "—",
    vehicleLabel: input.vehicleLabel || "Vehicle",
    vehicleLabelSecondary: "Vehicle",
    priceLabel: price,
    priceAltLabel: price,
    pricePlain: input.priceJmd != null ? String(input.priceJmd) : "0",
    quoteRef: input.quoteRef || "—",
    requestRef: "—",
    partBrand: "OEM",
    partNumber: input.partNumber || "—",
    partNumberAlt: "—",
    hubLabel: "Fleet hub",
  };
}

export const emptyFindPartsScreenData: FindPartsScreenData = buildFindPartsScreenData({});
