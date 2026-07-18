/**
 * Client for Toll Brain classify (local mirror + optional Edge shadow).
 */

import type {
  TollBrainClassifyMatchInput,
  TollBrainClassifyMatchResult,
} from '@roam/types/tollBrain';
import { classifyTollMatch } from '../utils/tollBrainClassify';
import { FLEET_USE_TOLL_BRAIN, TOLL_BRAIN_SHADOW_COMPARE } from '../utils/tollBrainFlags';

function brainBaseUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
}

function internalSecret(): string {
  return import.meta.env.VITE_TOLL_BRAIN_INTERNAL_SECRET || '';
}

export async function classifyMatchForRecon(
  input: TollBrainClassifyMatchInput,
): Promise<TollBrainClassifyMatchResult> {
  const local = classifyTollMatch(input);

  const secret = internalSecret();
  const base = brainBaseUrl();
  if (secret && base && (FLEET_USE_TOLL_BRAIN || TOLL_BRAIN_SHADOW_COMPARE)) {
    try {
      const res = await fetch(`${base}/functions/v1/toll-brain/v1/internal/classify-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Toll-Brain-Internal-Secret': secret,
        },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        const data = await res.json();
        const remote = data as TollBrainClassifyMatchResult;
        if (TOLL_BRAIN_SHADOW_COMPARE) {
          const lBest = local.best?.matchType;
          const rBest = remote.best?.matchType;
          if (lBest !== rBest || local.classification.matchStatus !== remote.classification?.matchStatus) {
            console.warn('[TollBrain] shadow mismatch', {
              local: local.classification,
              remote: remote.classification,
            });
          } else {
            console.info('[TollBrain] shadow parity ok', { matchType: lBest });
          }
        }
        if (FLEET_USE_TOLL_BRAIN && remote.suggestions) return remote;
      }
    } catch (e) {
      console.warn('[TollBrain] Edge classify unavailable — using local mirror', e);
    }
  }

  return local;
}

export function shouldConsumeTollBrain(): boolean {
  return FLEET_USE_TOLL_BRAIN;
}

export function shouldShadowCompareTollBrain(): boolean {
  return TOLL_BRAIN_SHADOW_COMPARE && !FLEET_USE_TOLL_BRAIN;
}
