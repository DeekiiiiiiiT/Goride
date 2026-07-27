/**
 * Partition tolls into a single suggestions rail + leftover table rows.
 * Orphan personal is a suggestion kind (card variant), not a separate product surface.
 */

import { FinancialTransaction } from '../types/data';
import { MatchResult } from './tollReconciliation';
import { isOrphanPersonalMatch, isTripLinkConfirmed } from './tollBucket';

export type SuggestionKind = 'orphan' | 'personal' | 'deadhead' | 'money' | 'ambiguous';

export interface SuggestionEntry {
  toll: FinancialTransaction;
  kind: SuggestionKind;
  orphanMode: boolean;
}

export type SuggestionStepId = 'needs-review' | 'personal-use' | 'deadhead';

function needsTripPick(tx: FinancialTransaction, match?: MatchResult): boolean {
  return !!(match?.isAmbiguous && !isTripLinkConfirmed(tx));
}

function kindForMatch(
  tx: FinancialTransaction,
  best: MatchResult,
): SuggestionKind {
  if (isOrphanPersonalMatch(best)) return 'orphan';
  if (needsTripPick(tx, best)) return 'ambiguous';
  if (best.matchType === 'DEADHEAD_MATCH') return 'deadhead';
  if (best.matchType === 'PERSONAL_MATCH') return 'personal';
  return 'money';
}

function isHighConfidenceSuggestion(best: MatchResult): boolean {
  if (best.confidenceScore != null) return best.confidenceScore >= 50;
  return (
    best.confidence === 'high' ||
    best.matchType === 'DEADHEAD_MATCH' ||
    best.matchType === 'PERSONAL_MATCH'
  );
}

/**
 * Split filtered step tolls into suggestions (one rail) vs other (table).
 * Personal Use keeps belt-and-suspenders: only PERSONAL_MATCH (+ orphans).
 */
export function partitionSuggestions(
  tolls: FinancialTransaction[],
  suggestions: Map<string, MatchResult[]>,
  stepId?: SuggestionStepId,
): { suggestions: SuggestionEntry[]; other: FinancialTransaction[] } {
  const suggestionEntries: SuggestionEntry[] = [];
  const suggestionIds = new Set<string>();

  for (const toll of tolls) {
    const best = suggestions.get(toll.id)?.[0];
    if (!best) continue;

    const orphan = isOrphanPersonalMatch(best);
    if (stepId === 'personal-use') {
      if (!orphan && best.matchType !== 'PERSONAL_MATCH') continue;
      if (orphan || isHighConfidenceSuggestion(best)) {
        suggestionEntries.push({
          toll,
          kind: kindForMatch(toll, best),
          orphanMode: orphan,
        });
        suggestionIds.add(toll.id);
      }
      continue;
    }

    if (orphan) continue; // orphans only surface on personal-use step
    if (!isHighConfidenceSuggestion(best)) continue;

    suggestionEntries.push({
      toll,
      kind: kindForMatch(toll, best),
      orphanMode: false,
    });
    suggestionIds.add(toll.id);
  }

  // Ambiguous first, then orphans, then the rest — keeps trip-pick urgent.
  const rank = (k: SuggestionKind) =>
    k === 'ambiguous' ? 0 : k === 'orphan' ? 1 : 2;
  suggestionEntries.sort((a, b) => rank(a.kind) - rank(b.kind));

  const other = tolls.filter((tx) => !suggestionIds.has(tx.id));
  return { suggestions: suggestionEntries, other };
}

export function smartReadyBannerLabel(stepId?: SuggestionStepId): string {
  if (stepId === 'personal-use') return 'Confirm personal';
  if (stepId === 'deadhead') return 'Confirm deadhead';
  return 'Ready to link';
}
