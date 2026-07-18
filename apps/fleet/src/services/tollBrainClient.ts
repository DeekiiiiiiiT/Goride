/**
 * Toll Brain classify for Fleet UI — local mirror only.
 * Internal Edge secrets must NEVER be VITE_-prefixed (secrets audit Wave 0).
 */

import type {
  TollBrainClassifyMatchInput,
  TollBrainClassifyMatchResult,
} from '@roam/types/tollBrain';
import { classifyTollMatch } from '../utils/tollBrainClassify';
import { FLEET_USE_TOLL_BRAIN, TOLL_BRAIN_SHADOW_COMPARE } from '../utils/tollBrainFlags';

/** Local algorithm only — same rules as Edge; no browser→Edge secret hop. */
export async function classifyMatchForRecon(
  input: TollBrainClassifyMatchInput,
): Promise<TollBrainClassifyMatchResult> {
  return classifyTollMatch(input);
}

export function shouldConsumeTollBrain(): boolean {
  return FLEET_USE_TOLL_BRAIN;
}

export function shouldShadowCompareTollBrain(): boolean {
  return TOLL_BRAIN_SHADOW_COMPARE && !FLEET_USE_TOLL_BRAIN;
}
