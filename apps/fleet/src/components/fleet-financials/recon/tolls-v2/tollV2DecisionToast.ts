import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchTollV2Desk } from './useTollV2Desk';
import type { TollV2Charge } from './types';
import { chargeWhen, decisionUndoPayload, fmtTollMinor } from './tollV2Format';

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
