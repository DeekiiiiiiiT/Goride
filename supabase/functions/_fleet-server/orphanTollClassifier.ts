/**
 * Deno shim — re-exports fleet-canonical classifier from packages/toll-core.
 * Relative path so Deno does not need a workspace package resolver.
 */
export {
  classifyOrphanToll,
} from "../../../packages/toll-core/src/orphanTollClassifier.ts";
export type {
  PersonalUseReasonCode,
  OrphanCandidateTrip,
  OrphanClassifierInput,
  OrphanClassification,
} from "../../../packages/toll-core/src/orphanTollClassifier.ts";
