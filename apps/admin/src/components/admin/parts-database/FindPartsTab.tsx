import { FindPartsFlow } from "./find-parts/FindPartsFlow";

export function FindPartsTab({
  initialVariantId,
  onAdd,
}: {
  initialVariantId?: string;
  onOpenVehicle: (variantId: string) => void;
  onAdd: (variantId: string) => void;
}) {
  return <FindPartsFlow initialVariantId={initialVariantId} onAdd={onAdd} />;
}
