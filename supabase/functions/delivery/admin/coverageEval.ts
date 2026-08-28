/**
 * Shared coverage evaluation for Rush delivery markets.
 * Implementation lives in @roam/dash-coverage — this file keeps existing import paths.
 */
export {
  buildParishSyntheticZone,
  evaluateCoverage,
  isInsideParishFoundation,
  parseFoundationGeometry,
  parseFoundationPolygon,
  pointInPolygon,
  type CoverageEvalResult,
  type CoverageMultiPolygon,
  type CoverageVertex,
  type CoverageZone,
  type ParishCoverageMode,
} from "../../_shared/dashCoverage.ts";
