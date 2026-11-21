import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { supabase } from '../../../../../utils/supabase/client';
import { useTollV2Commands } from '../useTollV2Commands';
import { TollV2ApprovalReasonDialog } from '../dialogs/TollV2DisputeDialogs';
import { TollV2PrimaryButton, TollV2SecondaryButton } from '../TollV2Buttons';
import {
  diffPolicy,
  draftFrom,
  type TollBearer,
  type TollPolicyDraft,
  type TollSettingsRead,
} from './tollPolicyLogic';

export const TOLL_SETTINGS_KEY = ['toll-v2-settings'] as const;

export async function fetchTollSettings(): Promise<TollSettingsRead> {
  const { data, error } = await supabase.rpc('toll_v2_toll_settings');
  if (error) throw error;
  const d = (data ?? {}) as Partial<TollSettingsRead>;
  return {
    switches: d.switches ?? null,
    disputePolicy: d.disputePolicy ?? null,
    platforms: d.platforms ?? [],
    plazas: d.plazas ?? [],
    missing: d.missing ?? [],
    seeded: d.seeded === true,
    approvals: d.approvals ?? { soleManager: false, thresholdMinor: 500000 },
  };
}

/**
 * Fleet Policy Configuration → Tolls: only "When a dispute doesn't work out" (owner, 21 Nov).
 * Platform rules live in Roam Fleet Admin → Toll platforms; toll prices live in Dominion.
 */
export function TollPolicyTab() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: TOLL_SETTINGS_KEY, queryFn: fetchTollSettings, staleTime: 30_000 });
  const { runCommand, busy, approvalAsk } = useTollV2Commands('');
  const s = query.data;
  const saved = useMemo(() => (s ? draftFrom(s) : null), [s]);
  const [draft, setDraft] = useState<TollPolicyDraft | null>(null);

  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  const diff = useMemo(() => (saved && draft ? diffPolicy(saved, draft) : null), [saved, draft]);
  const nChanges = diff?.changes.length ?? 0;
  const refresh = () => queryClient.invalidateQueries({ queryKey: TOLL_SETTINGS_KEY });

  if (query.isLoading || !s || !draft) {
    return <p className="py-10 text-center text-sm text-[#47464c]">{query.isError ? 'Toll settings could not be loaded.' : 'Loading toll settings…'}</p>;
  }

  // Owner 21 Nov: toll settings save straight away; no reason, no second manager.
  const save = async () => {
    if (!diff || nChanges === 0) return;
    const body: Record<string, unknown> = { dispute_policy: diff.body.dispute_policy, note: 'Toll settings changed' };
    try {
      const res = await runCommand('change_toll_settings', body);
      if (res === null) return;
      await refresh();
      toast.success('Toll settings saved');
    } catch {
      /* error toast shown by runCommand */
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="toll-policy-tab">
      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-[#0b1c30]">When a dispute doesn&apos;t work out</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <BearerQuestion
            q="When a dispute is lost, who pays?"
            value={draft.lostBearer}
            onChange={(v) => setDraft({ ...draft, lostBearer: v })}
            testId="toll-policy-lost"
          />
          <BearerQuestion
            q="When the driver doesn't send it in time, who pays?"
            value={draft.expiredBearer}
            onChange={(v) => setDraft({ ...draft, expiredBearer: v })}
            testId="toll-policy-expired"
          />
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-[#47464c]">
          <Info className="h-4 w-4 shrink-0" aria-hidden />
          If Roam learned about the toll too late for the driver to send it, the fleet always pays.
        </p>
      </section>

      <div className="sticky bottom-4 z-20 rounded-2xl border border-[#e5eeff] bg-white/95 px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-[#47464c]" data-testid="toll-policy-change-count">
            {nChanges === 0 ? 'No changes' : `${nChanges} change${nChanges === 1 ? '' : 's'}`}
          </span>
          <div className="flex gap-2">
            <TollV2SecondaryButton type="button" className="w-auto" disabled={nChanges === 0} onClick={() => saved && setDraft(saved)}>
              Discard
            </TollV2SecondaryButton>
            <TollV2PrimaryButton type="button" className="w-auto" disabled={nChanges === 0 || busy} onClick={() => void save()} data-testid="toll-policy-save">
              Save
            </TollV2PrimaryButton>
          </div>
        </div>
      </div>

      <TollV2ApprovalReasonDialog
        intent={approvalAsk?.intent ?? null}
        amountMinor={approvalAsk?.amountMinor ?? null}
        onDone={(reason) => approvalAsk?.resolve(reason)}
      />
    </div>
  );
}

function BearerQuestion({
  q,
  value,
  onChange,
  testId,
}: {
  q: string;
  value: TollBearer;
  onChange: (v: TollBearer) => void;
  testId: string;
}) {
  return (
    <div className="rounded-xl bg-[#f8f9ff] p-4" data-testid={testId}>
      <p className="text-sm font-medium text-[#0b1c30]">{q}</p>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-[#eff4ff] p-1" role="radiogroup" aria-label={q}>
        {(['fleet', 'driver'] as const).map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={value === b}
            onClick={() => onChange(b)}
            className={`h-9 rounded-lg text-sm font-semibold ${value === b ? 'bg-[#030213] text-white' : 'text-[#47464c]'}`}
          >
            {b === 'fleet' ? 'The fleet' : 'The driver'}
          </button>
        ))}
      </div>
    </div>
  );
}

