import {
  DAIHATSU_MODELS,
  HONDA_MODELS,
  ISUZU_MODELS,
  MAZDA_MODELS,
  MITSUBISHI_MODELS,
  NISSAN_MODELS,
  SUBARU_MODELS,
  SUZUKI_MODELS,
} from "./jdmBrandModels.generated";
import { TOYOTA_MODELS, TOYOTA_REFERENCE_MAKE } from "./toyotaVehicleReference";

/** Ordered list for the Make dropdown (Toyota + brands from `IDEA_2.md`). */
export const CATALOG_REFERENCE_MAKES = [
  TOYOTA_REFERENCE_MAKE,
  "Nissan",
  "Honda",
  "Mazda",
  "Mitsubishi",
  "Subaru",
  "Daihatsu",
  "Suzuki",
  "Isuzu",
] as const;

export type CatalogReferenceMake = (typeof CATALOG_REFERENCE_MAKES)[number];

export const MODELS_BY_MAKE: Record<CatalogReferenceMake, readonly string[]> = {
  Toyota: TOYOTA_MODELS,
  Nissan: NISSAN_MODELS,
  Honda: HONDA_MODELS,
  Mazda: MAZDA_MODELS,
  Mitsubishi: MITSUBISHI_MODELS,
  Subaru: SUBARU_MODELS,
  Daihatsu: DAIHATSU_MODELS,
  Suzuki: SUZUKI_MODELS,
  Isuzu: ISUZU_MODELS,
};

const MAKE_SET = new Set<string>(CATALOG_REFERENCE_MAKES);

export function isCatalogReferenceMake(s: string): s is CatalogReferenceMake {
  return MAKE_SET.has(s);
}
