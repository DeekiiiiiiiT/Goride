/**
 * Toll plaza loader — re-exports the shared Edge loader (rides + Toll Brain).
 */
export {
  applyTollInfoRateOverlay,
  invalidateTollPlazaCache,
  loadTollPlazaById,
  loadTollPlazas,
  parseKvTollPlaza,
  schedulePlazasFromTollInfo,
  type LoadedTollPlaza,
  type LoadTollPlazasOptions,
  type TollPlaza,
} from "../../_shared/tollPlazaLoader.ts";
