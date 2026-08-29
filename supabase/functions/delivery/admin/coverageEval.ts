/**
 * Shared coverage evaluation for Rush delivery markets.
 * Implementation lives in @roam/dash-coverage — this file keeps existing import paths.
 */
export {
  buildParishSyntheticZone,
  coverageRoleForZone,
  evaluateCoverage,
  evaluateHexCoverage,
  evaluateLiveCoverage,
  filterLiveCoverageZones,
  isInsideParishFoundation,
  parseFoundationGeometry,
  parseFoundationPolygon,
  pointInPolygon,
  COVERAGE_CUSTOMER_COPY,
  type CoverageEvalResult,
  type CoverageMultiPolygon,
  type CoverageVertex,
  type CoverageZone,
  type ParishCoverageMode,
} from "../../_shared/dashCoverage.ts";
