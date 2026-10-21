/**
 * Week-scope inputs for Finish / GET readiness so padded match loads and
 * global dispute lists cannot block a clean Mon–Sun period.
 * Aligns with wizard `isDisputeRefundInWizardPeriod` + period-bucketed unlinked.
 */
import { dateWeekKey } from '../../finance-core/src/periodKey.ts';
import {
  isDisputeRefundInWizardPeriod,
  type DisputeRefundAnchor,
} from './tollPeriodDisputeHelpers.ts';

export function dateBelongsToWeek(
  dateStr: string | null | undefined,
  weekKey: string,
  fleetTz: string,
): boolean {
  const key = dateWeekKey(dateStr, fleetTz);
  return !!key && key === String(weekKey).slice(0, 10);
}

export function resolveClaimAnchorDate(
  claim: {
    transactionId?: string | null;
    date?: string | null;
    tripDate?: string | null;
  },
  tollDateById: ReadonlyMap<string, string>,
): string | null {
  if (claim.transactionId) {
    const tollDate = tollDateById.get(String(claim.transactionId));
    if (tollDate) return tollDate;
  }
  const raw = claim.date || claim.tripDate;
  return raw ? String(raw) : null;
}

export function scopeTollReadinessWeekInputs<
  TToll extends { id?: string | null; date?: string | null },
  TTrip extends { id?: string | null; date?: string | null },
  TDispute extends DisputeRefundAnchor,
  TClaim extends {
    id?: string | null;
    type?: string | null;
    transactionId?: string | null;
    date?: string | null;
    tripDate?: string | null;
  },
>(input: {
  weekKey: string;
  fleetTz: string;
  tollTx: TToll[];
  trips: TTrip[];
  disputeRefunds: TDispute[];
  claims?: TClaim[];
}): {
  weekTolls: TToll[];
  weekTrips: TTrip[];
  weekDisputes: TDispute[];
  weekClaims: TClaim[];
  periodTollIds: Set<string>;
  periodClaimIds: Set<string>;
  tollDateById: Map<string, string>;
} {
  const weekKey = String(input.weekKey).slice(0, 10);
  const fleetTz = input.fleetTz;

  const tollDateById = new Map<string, string>();
  for (const tx of input.tollTx || []) {
    if (tx?.id != null && tx?.date) {
      tollDateById.set(String(tx.id), String(tx.date).slice(0, 10));
    }
  }

  const weekTolls = (input.tollTx || []).filter((tx) =>
    dateBelongsToWeek(tx?.date, weekKey, fleetTz),
  );
  const weekTrips = (input.trips || []).filter((t) =>
    dateBelongsToWeek(t?.date, weekKey, fleetTz),
  );

  const periodTollIds = new Set(
    weekTolls.map((t) => String(t.id)).filter((id) => id && id !== 'undefined'),
  );

  const weekClaims = (input.claims || []).filter((claim) => {
    if (!claim || claim.type !== 'Toll_Refund') return false;
    const anchor = resolveClaimAnchorDate(claim, tollDateById);
    return dateBelongsToWeek(anchor, weekKey, fleetTz);
  });

  const periodClaimIds = new Set(
    weekClaims.map((c) => String(c.id)).filter((id) => id && id !== 'undefined'),
  );

  const weekDisputes = (input.disputeRefunds || []).filter((r) =>
    isDisputeRefundInWizardPeriod(r, weekKey, fleetTz, periodTollIds, periodClaimIds),
  );

  return {
    weekTolls,
    weekTrips,
    weekDisputes,
    weekClaims,
    periodTollIds,
    periodClaimIds,
    tollDateById,
  };
}
