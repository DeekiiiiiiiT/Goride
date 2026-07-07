import type { LearntLocationDto, StationGateEvidenceRow, UnresolvedStopRow } from './resolutionQueueTypes';

function rowActivityDate(learnt?: LearntLocationDto, evidence?: StationGateEvidenceRow): string {
  if (evidence?.date) return evidence.date;
  if (learnt?.timestamp) return learnt.timestamp;
  if (learnt?.firstSeen) return learnt.firstSeen;
  return '';
}

function matchesLearntToEvidence(learnt: LearntLocationDto, evidence: StationGateEvidenceRow): boolean {
  if (evidence.learntLocationId && evidence.learntLocationId === learnt.id) return true;
  if (learnt.transactionId && learnt.transactionId === evidence.id) return true;
  if (learnt.sourceEntryId && learnt.sourceEntryId === evidence.id) return true;
  return false;
}

/** Join learnt staging rows with gate-held evidence into a unified queue. */
export function buildUnresolvedStopRows(
  learntLocations: LearntLocationDto[],
  evidenceRows: StationGateEvidenceRow[],
): UnresolvedStopRow[] {
  const consumedLearntIds = new Set<string>();
  const rows: UnresolvedStopRow[] = [];

  for (const evidence of evidenceRows) {
    const matchedLearnt = learntLocations.find((l) => matchesLearntToEvidence(l, evidence));
    if (matchedLearnt) {
      consumedLearntIds.add(matchedLearnt.id);
      rows.push({
        rowKey: `linked:${matchedLearnt.id}:${evidence.id}`,
        linkage: 'linked',
        learnt: matchedLearnt,
        evidence,
        sortDate: rowActivityDate(matchedLearnt, evidence),
      });
    } else {
      rows.push({
        rowKey: `payment:${evidence.id}`,
        linkage: 'payment_only',
        evidence,
        sortDate: rowActivityDate(undefined, evidence),
      });
    }
  }

  for (const learnt of learntLocations) {
    if (consumedLearntIds.has(learnt.id)) continue;
    rows.push({
      rowKey: `location:${learnt.id}`,
      linkage: 'location_only',
      learnt,
      sortDate: rowActivityDate(learnt),
    });
  }

  rows.sort((a, b) => {
    const da = new Date(a.sortDate || 0).getTime();
    const db = new Date(b.sortDate || 0).getTime();
    return db - da;
  });

  return rows;
}

export function filterUnresolvedRows(rows: UnresolvedStopRow[], filter: string): UnresolvedStopRow[] {
  if (filter === 'all') return rows;
  return rows.filter((r) => r.linkage === filter);
}
