import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ChevronRight, Info, Lock, Plus, X } from 'lucide-react';
import { supabase } from '../../../../../utils/supabase/client';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import { Switch } from '../../../../ui/switch';
import { Input } from '../../../../ui/input';
import { Label } from '../../../../ui/label';
import { useTollV2Commands } from '../useTollV2Commands';
import { TollV2ApprovalReasonDialog } from '../dialogs/TollV2DisputeDialogs';
import { TollV2PrimaryButton, TollV2SecondaryButton } from '../TollV2Buttons';
import { fmtTollMinor } from '../tollV2Format';
import {
  PAYBACK_MODES,
  diffPolicy,
  draftFrom,
  missingLine,
  parseJmd,
  platformName,
  rateCell,
  sinceText,
  type TollBearer,
  type TollPlazaSettings,
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

type AddRatePrefill = { plazaId?: string; platform?: string } | null;

/** Fleet Policy Configuration → Tolls (UI2, audit C3). Save → change_toll_settings; Add rate → plaza_rates_add. */
export function TollPolicyTab() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: TOLL_SETTINGS_KEY, queryFn: fetchTollSettings, staleTime: 30_000 });
  const { runCommand, busy, approvalAsk } = useTollV2Commands('');
  const s = query.data;
  const saved = useMemo(() => (s ? draftFrom(s) : null), [s]);
  const [draft, setDraft] = useState<TollPolicyDraft | null>(null);
  const [addRate, setAddRate] = useState<AddRatePrefill>(null);
  const [history, setHistory] = useState<TollPlazaSettings | null>(null);

  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  const diff = useMemo(() => (saved && draft ? diffPolicy(saved, draft) : null), [saved, draft]);
  const nChanges = diff?.changes.length ?? 0;
  const refresh = () => queryClient.invalidateQueries({ queryKey: TOLL_SETTINGS_KEY });

  if (query.isLoading || !s || !draft) {
    return <p className="py-10 text-center text-sm text-[#47464c]">{query.isError ? 'Toll settings could not be loaded.' : 'Loading toll settings…'}</p>;
  }

  const plazaName = (id: string) => s.plazas.find((p) => p.plazaId === id)?.name || 'A toll plaza';
  const disputePlatforms = Object.entries(draft.platforms)
    .filter(([, p]) => p.takesDisputes)
    .map(([k]) => k);

  // Owner 21 Nov: toll settings save straight away; no reason, no second manager.
  const save = async () => {
    if (!diff || nChanges === 0) return;
    const body: Record<string, unknown> = { ...diff.body, note: 'Toll settings changed' };
    try {
      const res = await runCommand('change_toll_settings', body);
      if (res === null) return;
      await refresh();
      toast.success('Toll settings saved');
    } catch {
      /* error toast shown by runCommand */
    }
  };

  const addRateSave = async (row: { plaza_id: string; platform: string; rate_minor: number; effective_from: string }) => {
    try {
      const res = await runCommand('change_toll_settings', { plaza_rates_add: [row], note: 'Add rate' });
      if (res === null) return;
      setAddRate(null);
      await refresh();
      toast.success('Rate added');
    } catch {
      /* error toast shown by runCommand */
    }
  };

  const setPlat = (plat: string, patch: Partial<TollPolicyDraft['platforms'][string]>) =>
    setDraft({ ...draft, platforms: { ...draft.platforms, [plat]: { ...draft.platforms[plat], ...patch } } });

  return (
    <div className="flex flex-col gap-6" data-testid="toll-policy-tab">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <SwitchChip label="Toll disputes" on={!!s.switches?.tollDisputes} />
          <SwitchChip label="InDrive rider pays driver" on={!!s.switches?.riderPaysDriver} />
          <SwitchChip label="Hand-logged trips" on={!!s.switches?.loggedTrips} />
        </div>
        <span className="flex items-center gap-1 text-xs text-[#47464c]">
          <Lock className="h-3.5 w-3.5" aria-hidden /> Switched on by Roam support.
        </span>
      </div>

      {s.missing.length > 0 ? (
        <section className="rounded-2xl bg-[#fff1f2] p-4 sm:p-5" data-testid="toll-policy-missing">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[#93000a]">
            <AlertTriangle className="h-5 w-5" aria-hidden /> Disputes can&apos;t open until these are set
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {s.missing.map((m, i) => (
              <li key={i} className="rounded-xl bg-white px-4 py-3 text-sm text-[#0b1c30]">
                {missingLine(m, plazaName)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <h3 className="px-4 pt-4 text-lg font-semibold text-[#0b1c30] sm:px-6 sm:pt-6">Platforms</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f8f9ff] text-left text-xs text-[#47464c]">
              <tr>
                <th className="px-4 py-2 font-medium sm:px-6">Platform</th>
                <th className="px-3 py-2 font-medium">Pays tolls back</th>
                <th className="px-3 py-2 font-medium">How</th>
                <th className="px-3 py-2 font-medium">Takes disputes</th>
                <th className="px-3 py-2 font-medium">Days to dispute</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff4ff]">
              {Object.entries(draft.platforms).map(([plat, p]) => (
                <tr key={plat} data-testid={`toll-policy-platform-${plat}`}>
                  <td className="px-4 py-3 font-semibold text-[#0b1c30] sm:px-6">{platformName(plat)}</td>
                  <td className="px-3 py-3">
                    <Switch
                      checked={p.paysTollsBack}
                      onCheckedChange={(v) => setPlat(plat, { paysTollsBack: v })}
                      aria-label={`${platformName(plat)} pays tolls back`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <select
                      className="h-9 rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm text-[#0b1c30]"
                      value={p.paybackMode}
                      onChange={(e) => setPlat(plat, { paybackMode: e.target.value })}
                      aria-label={`How ${platformName(plat)} pays tolls back`}
                    >
                      {PAYBACK_MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <Switch
                      checked={p.takesDisputes}
                      onCheckedChange={(v) => setPlat(plat, { takesDisputes: v })}
                      aria-label={`${platformName(plat)} takes disputes`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    {p.takesDisputes ? (
                      <span className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          className="h-9 w-20 rounded-xl"
                          value={p.disputeWindowDays ?? ''}
                          onChange={(e) =>
                            setPlat(plat, { disputeWindowDays: e.target.value === '' ? null : Number(e.target.value) })
                          }
                          aria-label={`${platformName(plat)} days to dispute`}
                        />
                        <span className="text-[#47464c]">days</span>
                      </span>
                    ) : (
                      <span className="text-[#47464c]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-6">
          <h3 className="text-lg font-semibold text-[#0b1c30]">Toll prices</h3>
          <TollV2PrimaryButton type="button" className="w-auto" onClick={() => setAddRate({})} data-testid="toll-policy-add-rate">
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Add rate
          </TollV2PrimaryButton>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f8f9ff] text-left text-xs text-[#47464c]">
              <tr>
                <th className="px-4 py-2 font-medium sm:px-6">Plaza</th>
                <th className="px-3 py-2 text-right font-medium">Tag price</th>
                <th className="px-3 py-2 text-right font-medium">Uber pays</th>
                <th className="px-3 py-2 text-right font-medium">InDrive</th>
                <th className="px-3 py-2 font-medium">Since</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff4ff]">
              {s.plazas.map((pz) => {
                const uber = rateCell(pz, 'uber');
                const indrive = rateCell(pz, 'indrive');
                const uberNeeded = disputePlatforms.includes('uber');
                const since = pz.platformRates.find((r) => r.platform === 'uber')?.current.validFrom ?? pz.tagPrice.current.validFrom;
                return (
                  <tr key={pz.plazaId} className="cursor-pointer hover:bg-[#f8f9ff]" onClick={() => setHistory(pz)} data-testid={`toll-policy-plaza-${pz.plazaId}`}>
                    <td className="px-4 py-3 font-medium text-[#0b1c30] sm:px-6">{pz.name || 'Toll plaza'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtTollMinor(pz.tagPrice.current.amountMinor)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {uber.missing && uberNeeded ? (
                        <button
                          type="button"
                          className="rounded-full bg-[#ffdad6] px-2.5 py-0.5 text-xs font-semibold text-[#93000a]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddRate({ plazaId: pz.plazaId, platform: 'uber' });
                          }}
                          data-testid="toll-policy-missing-chip"
                        >
                          Missing
                        </button>
                      ) : (
                        <span className="text-[#069669]">{uber.text}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#47464c]">{indrive.text}</td>
                    <td className="px-3 py-3 text-[#47464c]">{uber.missing ? '—' : sinceText(since)}</td>
                    <td className="pr-4 text-[#47464c]">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

      {addRate ? (
        <AddRateDialog
          plazas={s.plazas}
          platforms={Object.keys(draft.platforms)}
          prefill={addRate}
          busy={busy}
          onCancel={() => setAddRate(null)}
          onAdd={(row) => void addRateSave(row)}
        />
      ) : null}
      {history ? (
        <HistoryPanel plaza={history} onClose={() => setHistory(null)} onAddRate={() => setAddRate({ plazaId: history.plazaId })} />
      ) : null}
      <TollV2ApprovalReasonDialog
        intent={approvalAsk?.intent ?? null}
        amountMinor={approvalAsk?.amountMinor ?? null}
        onDone={(reason) => approvalAsk?.resolve(reason)}
      />
    </div>
  );
}

function SwitchChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        on ? 'bg-[#ecfdf5] text-[#069669]' : 'bg-[#f1f5f9] text-[#47464c]'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-[#069669]' : 'bg-[#94a3b8]'}`} />
      {label}: {on ? 'On' : 'Off'}
    </span>
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

function AddRateDialog({
  plazas,
  platforms,
  prefill,
  busy,
  onCancel,
  onAdd,
}: {
  plazas: TollPlazaSettings[];
  platforms: string[];
  prefill: { plazaId?: string; platform?: string };
  busy: boolean;
  onCancel: () => void;
  onAdd: (row: { plaza_id: string; platform: string; rate_minor: number; effective_from: string }) => void;
}) {
  const [plazaId, setPlazaId] = useState(prefill.plazaId ?? plazas[0]?.plazaId ?? '');
  const [platform, setPlatform] = useState(prefill.platform ?? (platforms.includes('uber') ? 'uber' : platforms[0] ?? 'uber'));
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('');
  const minor = parseJmd(amount);
  const plaza = plazas.find((p) => p.plazaId === plazaId);
  const current = plaza?.platformRates.find((r) => r.platform === platform)?.current;
  const ok = !!plazaId && !!platform && minor != null && /^\d{4}-\d{2}-\d{2}$/.test(from);
  return (
    <AlertDialog open onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent data-testid="toll-policy-add-rate-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Add a new rate</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="toll-rate-plaza">Plaza</Label>
            <select id="toll-rate-plaza" className="h-10 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm" value={plazaId} onChange={(e) => setPlazaId(e.target.value)}>
              {plazas.map((p) => (
                <option key={p.plazaId} value={p.plazaId}>
                  {p.name || 'Toll plaza'}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="toll-rate-platform">Platform</Label>
            <select id="toll-rate-platform" className="h-10 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {platformName(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="toll-rate-amount">Amount the platform pays</Label>
            <Input id="toll-rate-amount" inputMode="decimal" placeholder="J$ 0.00" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="toll-rate-amount" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="toll-rate-from">Starts on</Label>
            <Input id="toll-rate-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="toll-rate-from" />
          </div>
        </div>
        {current?.amountMinor != null && from ? (
          <p className="flex items-start gap-2 rounded-xl bg-[#eff6ff] p-3 text-sm text-[#1d4ed8]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            The current rate {fmtTollMinor(current.amountMinor)} stays for trips before {sinceText(from).replace(/^from /, '')}. Nothing already decided changes.
          </p>
        ) : null}
        <AlertDialogFooter>
          <TollV2SecondaryButton type="button" onClick={onCancel}>
            Cancel
          </TollV2SecondaryButton>
          <TollV2PrimaryButton
            type="button"
            disabled={!ok || busy}
            onClick={() => minor != null && onAdd({ plaza_id: plazaId, platform, rate_minor: minor, effective_from: from })}
            data-testid="toll-rate-confirm"
          >
            Add rate
          </TollV2PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function HistoryPanel({ plaza, onClose, onAddRate }: { plaza: TollPlazaSettings; onClose: () => void; onAddRate: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const Row = ({ amountMinor, validFrom, now }: { amountMinor: number | null; validFrom: string | null; now: boolean }) => {
    const future = !!validFrom && validFrom > today;
    return (
      <li className={`flex items-center justify-between gap-2 py-2 text-sm ${now || future ? 'text-[#0b1c30]' : 'text-[#47464c]'}`}>
        <span>
          <span className="font-semibold tabular-nums">{fmtTollMinor(amountMinor)}</span> {sinceText(validFrom)}
        </span>
        {now ? (
          <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-xs font-semibold text-[#069669]">Now</span>
        ) : future ? (
          <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs font-semibold text-[#47464c]">
            Starts {sinceText(validFrom).replace(/^from /, '').replace(/ \d{4}$/, '')}
          </span>
        ) : null}
      </li>
    );
  };
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-[440px] flex-col gap-5 overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="toll-policy-history"
        aria-label={`${plaza.name} prices`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#0b1c30]">{plaza.name || 'Toll plaza'}</h3>
          <button type="button" className="rounded-lg border border-[#cbd5e1] p-1.5" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#47464c]">Tag price</h4>
          <ul className="divide-y divide-[#eff4ff]">
            {plaza.tagPrice.history.map((h) => (
              <Row key={`t-${h.validFrom}`} {...h} now={h.validFrom === plaza.tagPrice.current.validFrom} />
            ))}
          </ul>
        </section>
        {plaza.platformRates.map((r) => (
          <section key={r.platform}>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#47464c]">{platformName(r.platform)} pays</h4>
            <ul className="divide-y divide-[#eff4ff]">
              {r.history.map((h) => (
                <Row key={`${r.platform}-${h.validFrom}`} {...h} now={h.validFrom === r.current.validFrom} />
              ))}
            </ul>
          </section>
        ))}
        <TollV2PrimaryButton type="button" className="mt-auto" onClick={onAddRate}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Add rate
        </TollV2PrimaryButton>
      </aside>
    </div>
  );
}
