export function requestStatusLabel(status: string): { pill: string; tone: "amber" | "green" | "gray" } {
  const s = status.toLowerCase();
  if (s === "added" || s === "resolved" || s === "found") return { pill: "Added", tone: "green" };
  if (s === "cant_find" || s === "rejected" || s === "failed") return { pill: "We couldn't find it", tone: "gray" };
  return { pill: "We're looking", tone: "amber" };
}

export function trustUiLabel(raw: string): "Verified" | "Check before buying" {
  const s = raw.toLowerCase();
  if (s === "confirmed" || s === "verified") return "Verified";
  return "Check before buying";
}

export function popularChips() {
  return [
    { id: "pads", label: "Brake pads", icon: "disc_full" },
    { id: "oil-filter", label: "Oil filter", icon: "oil_barrel" },
    { id: "wiper", label: "Wiper blades", icon: "water_drop" },
    { id: "engine-oil", label: "Engine oil", icon: "local_gas_station" },
    { id: "brake-fluid", label: "Brake fluid", icon: "water_drop" },
    { id: "spark", label: "Spark plugs", icon: "bolt" },
  ];
}
