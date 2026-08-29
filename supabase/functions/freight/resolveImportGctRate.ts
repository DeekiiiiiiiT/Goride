/** Resolve import GCT rate fraction from Dominion GCT engine (dual-read). */
import { loadGlobalGctConfig } from '../_shared/gctRate.ts';
import { GCT_RATE } from './landedCost.ts';

type Sb = {
  schema?: (s: string) => { from: (t: string) => any };
  from: (t: string) => any;
};

export async function resolveImportGctRateFraction(sb?: Sb | null): Promise<number> {
  if (!sb) {
    console.warn(JSON.stringify({ event: 'freight_gct_rate_fallback', reason: 'no_client' }));
    return GCT_RATE;
  }
  try {
    const config = await loadGlobalGctConfig(sb);
    const frac = Math.max(0, Number(config.ratePercent)) / 100;
    if (!Number.isFinite(frac)) {
      console.warn(JSON.stringify({ event: 'freight_gct_rate_fallback', reason: 'invalid_config' }));
      return GCT_RATE;
    }
    return frac;
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: 'freight_gct_rate_fallback',
        reason: e instanceof Error ? e.message : 'error',
      }),
    );
    return GCT_RATE;
  }
}
