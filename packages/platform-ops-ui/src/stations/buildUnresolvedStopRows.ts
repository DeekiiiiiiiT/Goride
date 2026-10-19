import type {
  LearntLocationDto,
  ProvisionalFillDto,
  StationGateEvidenceRow,
  UnresolvedStopRow,
} from './resolutionQueueTypes';

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

/** Join learnt staging + gate evidence + provisional fills into a unified queue. */
export function buildUnresolvedStopRows(
  learntLocations: LearntLocationDto[],
  evidenceRows: StationGateEvidenceRow[],
  provisionalFills: ProvisionalFillDto[] = [],
): UnresolvedStopRow[] {
  const consumedLearntIds = new Set<string>();
  const consumedEntryIds = new Set<string>();
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
    if (evidence.id) consumedEntryIds.add(evidence.id);
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

  for (const fill of provisionalFills) {
    if (!fill?.id || consumedEntryIds.has(fill.id)) continue;
    const decidedAt =
      fill.metadata?.stationResolution &&
      typeof (fill.metadata.stationResolution as { decidedAt?: string }).decidedAt === 'string'
        ? (fill.metadata.stationResolution as { decidedAt?: string }).decidedAt
        : '';
    rows.push({
      rowKey: `provisional:${fill.id}`,
      linkage: 'provisional',
      provisional: fill,
      sortDate: String(fill.date || decidedAt || ''),
    });
  }

  rows.sort((a, b) => {
    const da = new Date(a.sortDate || 0).getTime();
    const db = new Date(b.sortDate || 0).getTime();
    return db - da;
  });

  return rows;
}

function rowStationResolutionReason(row: UnresolvedStopRow): string {
  const fromProv = row.provisional?.metadata?.stationResolution?.reason;
  if (fromProv) return String(fromProv);
  const fromEv = (row.evidence?.metadata as { stationResolution?: { reason?: string } } | undefined)
    ?.stationResolution?.reason;
  if (fromEv) return String(fromEv);
  return '';
}

export function filterUnresolvedRows(rows: UnresolvedStopRow[], filter: string): UnresolvedStopRow[] {
  if (filter === 'all') return rows;
  if (filter === 'statement_mismatch') {
    return rows.filter((r) => rowStationResolutionReason(r) === 'STATEMENT_MISMATCH');
  }
  if (filter === 'claim_conflict') {
    return rows.filter((r) => rowStationResolutionReason(r) === 'DRIVER_CLAIM_CONFLICT');
  }
  return rows.filter((r) => r.linkage === filter);
}
