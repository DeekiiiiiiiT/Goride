type VenueTemplateStyle =
  | "fast_food"
  | "sports_bar"
  | "fine_dining"
  | "cafe"
  | "ghost_kitchen"
  | "delivery_only";

export function resolveVenueStyleFromBusinessType(
  businessTypeId: string,
  label?: string | null,
): VenueTemplateStyle {
  const id = businessTypeId.toLowerCase().trim();
  const name = (label || id).toLowerCase();

  if (id === "fast_food" || name.includes("fast food")) return "fast_food";
  if (
    id === "cafe" ||
    id === "bakery" ||
    name.includes("cafe") ||
    name.includes("coffee") ||
    name.includes("bakery")
  ) {
    return "cafe";
  }
  if (name.includes("bar") || name.includes("sports")) return "sports_bar";
  if (name.includes("ghost")) return "ghost_kitchen";
  if (
    id === "grocery" ||
    id === "convenience" ||
    id === "pharmacy" ||
    id === "alcohol" ||
    name.includes("delivery only")
  ) {
    return "delivery_only";
  }
  if (id === "restaurant" || name.includes("restaurant") || name.includes("dining")) {
    return "fine_dining";
  }
  return "fast_food";
}
