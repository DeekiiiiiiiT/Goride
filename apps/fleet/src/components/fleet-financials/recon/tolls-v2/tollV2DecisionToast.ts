import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchTollV2Desk } from './useTollV2Desk';
import type { TollV2Charge, TollV2KeptPayback } from './types';
import { chargeWhen, decisionUndoPayload, fmtTollMinor, paybackLine } from './tollV2Format';

/** After "Keep with no toll": the same toast as a toll decision, with Undo. */
export async function toastAfterKeptPayback(
  queryClient: QueryClient,
  weekKey: string,
  paybackId: string,
  onUndo: (kept: TollV2KeptPayback) => void | Promise<void>,
) {
  const desk = await queryClient.fetchQuery({
    queryKey: ['toll-v2-desk', weekKey],
    queryFn: () => fetchTollV2Desk(weekKey),
  });
  const kept = desk.kept.find((k) => k.paybackId === paybackId || k.id === paybackId);
  if (!kept) {
    toast.success('Kept with no toll');
    return;
  }
  const line = `Kept with no toll: ${paybackLine(kept.trip, undefined, kept.amountMinor)}`;
  if (kept.undo) {
    toast.success(line, { action: { label: 'Undo', onClick: () => void onUndo(kept) } });
  } else {
    toast.success(line);
  }
}

export async function toastAfterTollDecision(
  queryClient: QueryClient,
  weekKey: string,
  chargeId: string,
  verb: string,
  onUndo: (charge: TollV2Charge) => void | Promise<void>,
) {
  const desk = await queryClient.fetchQuery({
    queryKey: ['toll-v2-desk', weekKey],
    queryFn: () => fetchTollV2Desk(weekKey),
  });
  const ch = desk.charges.find((c) => c.id === chargeId);
  if (!ch) {
    toast.success(verb);
    return;
  }
  const line = `${verb} ${chargeWhen(ch.occurredAt)} toll (${fmtTollMinor(ch.amountMinor)})`;
  const undo = decisionUndoPayload(ch.decision);
  if (undo) {
    toast.success(line, {
      action: {
        label: 'Undo',
        onClick: () => void onUndo(ch),
      },
    });
  } else {
    toast.success(line);
  }
}
