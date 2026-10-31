import { FindPartsFlow } from "./find-parts/FindPartsFlow";

export function FindPartsTab({
  initialVariantId,
  onOpenVehicle,
  onAdd,
}: {
  initialVariantId?: string;
  onOpenVehicle: (variantId: string) => void;
  onAdd: (variantId: string) => void;
}) {
  return <FindPartsFlow initialVariantId={initialVariantId} onOpenVehicle={onOpenVehicle} onAdd={onAdd} />;
}
