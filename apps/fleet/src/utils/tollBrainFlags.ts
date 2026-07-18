/**
 * Fleet Toll Brain flags.
 * FLEET_USE_TOLL_BRAIN defaults ON. Set VITE_FLEET_USE_TOLL_BRAIN=0 to rollback.
 */

export const FLEET_USE_TOLL_BRAIN =
  import.meta.env.VITE_FLEET_USE_TOLL_BRAIN !== '0';

/** Shadow compare only when consume is off and shadow env is on. */
export const TOLL_BRAIN_SHADOW_COMPARE =
  import.meta.env.VITE_TOLL_BRAIN_SHADOW_COMPARE === '1' && !FLEET_USE_TOLL_BRAIN;
