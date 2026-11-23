/**
 * Fleet Policy → Rules (fuel audit Part J screens 15, 16).
 * Look = the Stitch export (roam_fleet_fleet_policy_rules_tab_with_versions,
 * roam_fleet_add_a_version_locked_week_refused_dialog); content = fuelPolicyRulesModel.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CalendarRange,
  Car,
  ClipboardCheck,
  HelpCircle,
  History,
  Home,
  Info,
  Lock,
  Navigation,
  Pencil,
  Plus,
  Route,
  User,
  XCircle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import type { FuelScenario, FuelScenarioVersion } from '../../types/fuel';
import {
  firstOpenMonday,
  fuelRuleOf,
  planAddVersion,
  ruleEditableByPercent,
  splitRows,
  versionCards,
  weekOf,
  brainLines,
  type BrainPolicy,
  type SplitKey,
  type SplitRow,
} from '../../utils/fuelPolicyRulesModel';
import { normalizeScenarioVersions } from '../../utils/fuelPolicyVersion';

const ICON: Record<SplitKey, React.ComponentType<{ className?: string }>> = {
  rideShare: Car,
  deadhead: Navigation,
  commute: Home,
  companyUsage: ClipboardCheck,
  personal: User,
  leftover: HelpCircle,
};

const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

/** The six kinds of driving with a bar and "company / driver" (screen 15). */
export function PolicySplitRows({ rows }: { rows: SplitRow[] }) {
  return (
    <div data-testid="policy-split-rows">
      <div className="hidden grid-cols-[minmax(0,1fr)_140px_90px] gap-4 px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 sm:grid">
        <span>Kind of driving</span>
        <span className="text-right">Company pays</span>
        <span className="text-right">Company / driver</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const Icon = ICON[r.key];
          return (
            <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 sm:grid-cols-[minmax(0,1fr)_140px_90px]" data-testid={`policy-split-${r.key}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[15px] font-medium text-slate-900">
                  {r.label} {r.companyPct != null ? pct(r.companyPct) : ''}
                  {r.note ? <span className="block text-[12px] font-normal text-slate-500">{r.note}</span> : null}
                </span>
              </div>
              <div className="hidden sm:block">
                {r.companyPct != null ? (
                  <>
                    <div className="h-1.5 w-full rounded-full bg-slate-200">
                      <div className="h-1.5 rounded-full bg-[#0051d5]" style={{ width: `${r.companyPct}%` }} />
                    </div>
                    <p className="mt-1 text-right text-[11px] text-slate-500">{pct(r.companyPct)} company</p>
                  </>
                ) : null}
              </div>
              <span className="text-right text-[14px] font-medium tabular-nums text-slate-800">
                {r.companyPct != null ? `${pct(r.companyPct)} / ${pct(100 - r.companyPct)}` : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Versions of one policy, newest first (screen 15). */
export function PolicyVersionsSection({
  scenario,
  frozenMondays,
  thisMonday,
  todayYmd,
  onAdd,
  onEdit,
}: {
  scenario: FuelScenario;
  frozenMondays: readonly string[];
  thisMonday: string;
  todayYmd: string;
  onAdd?: () => void;
  onEdit?: (version: FuelScenarioVersion) => void;
}) {
  const cards = versionCards(scenario, { thisMonday, todayYmd, frozenMondays });
  return (
    <section className="space-y-3" data-testid="policy-versions">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-[17px] font-semibold text-slate-900">
            Versions
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{cards.length}</span>
          </h4>
          <p className="text-[13px] text-slate-500">Each version applies from a Monday. Locked weeks keep the version they were locked with.</p>
        </div>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[14px] font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> Add a version
          </button>
        ) : null}
      </div>
      {cards.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-500">
          No versions yet. Every week uses the split above.
        </p>
      ) : (
        <ul className="space-y-3">
          {cards.map((c) => (
            <li key={c.version.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row" data-testid="policy-version-card">
              <div className="min-w-0 space-y-1.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-semibold text-slate-900">Version {c.number}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      c.state === 'current'
                        ? 'bg-emerald-50 text-emerald-700'
                        : c.state === 'starts'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {c.chip}
                  </span>
                  {c.lockedWeeks > 0 ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">Closed weeks keep this split</span>
                  ) : null}
                </p>
                <p className="flex items-center gap-2 text-[14px] text-slate-800">
                  <CalendarRange className="h-4 w-4 shrink-0 text-[#0051d5]" /> {c.appliesLine}
                </p>
                {c.changes.map((ch) => (
                  <p key={ch.label} className="pl-6 text-[14px] text-slate-700">
                    {ch.label}: <strong className="font-semibold text-slate-900">{ch.now}</strong>
                    {ch.was ? <span className="ml-1 text-slate-400 line-through">(was {ch.was})</span> : null}
                  </p>
                ))}
                <p className="pl-6 font-mono text-[11px] text-slate-400">Version id {c.version.id}</p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <span className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-[12px] text-slate-600">
                  <Lock className="h-3.5 w-3.5" /> Weeks locked under this version: <strong className="text-slate-900">{c.lockedWeeks}</strong>
                </span>
                {c.activeDays != null ? (
                  <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
                    <History className="h-3.5 w-3.5" /> Active for {c.activeDays} {c.activeDays === 1 ? 'day' : 'days'}
                  </span>
                ) : null}
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(c.version)}
                    className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit version
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Screen 16: a new split from a Monday; a locked week is refused before saving. */
export function AddFuelVersionDialog({
  open,
  onOpenChange,
  scenario,
  allScenarios,
  frozenMondays,
  thisMonday,
  weekOptions,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario: FuelScenario | null;
  allScenarios: FuelScenario[];
  frozenMondays: readonly string[];
  thisMonday: string;
  /** Mondays to choose from (recent past included, so a locked week can be picked and refused). */
  weekOptions: string[];
  onSave: (scenario: FuelScenario) => Promise<void>;
}) {
  const baseRule = useMemo(() => {
    if (!scenario) return undefined;
    const n = normalizeScenarioVersions(scenario);
    const versions = n.versions || [];
    return fuelRuleOf(versions[versions.length - 1]?.rules) || fuelRuleOf(n.rules);
  }, [scenario]);
  const rows = useMemo(() => splitRows(baseRule), [baseRule]);
  const [values, setValues] = useState<Record<SplitKey, string>>({} as Record<SplitKey, string>);
  const [from, setFrom] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const v = {} as Record<SplitKey, string>;
    for (const r of rows) v[r.key] = r.companyPct != null ? String(r.companyPct) : '';
    setValues(v);
    setFrom(firstOpenMonday(frozenMondays, thisMonday));
  }, [open, rows, frozenMondays, thisMonday]);

  if (!scenario) return null;
  const editable = ruleEditableByPercent(baseRule);
  const percents: Partial<Record<SplitKey, number>> = {};
  let badField: SplitKey | null = null;
  for (const r of rows) {
    const raw = values[r.key];
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) badField = badField || r.key;
    else percents[r.key] = n;
  }
  const plan = editable && from && !badField
    ? planAddVersion({ scenario, allScenarios, fromMonday: from, percents, frozenMondays, thisMonday })
    : null;
  const fromError = plan && !plan.ok && plan.field === 'from' ? plan.error : null;
  const splitHint = plan && !plan.ok && plan.field === 'split' ? plan.error : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[640px] overflow-y-auto rounded-3xl bg-white p-8" data-testid="add-fuel-version">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-[22px] font-semibold text-slate-900">Add a version of {scenario.name}</DialogTitle>
          <DialogDescription className="text-[14px] text-slate-500">
            Set what the company pays for each kind of driving, and the week it starts.
          </DialogDescription>
        </DialogHeader>

        {!editable ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-[14px] text-slate-600">
            This rule isn&apos;t split by percentages. Change it with Edit splits.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {rows.map((r) => {
              const n = Number(values[r.key]);
              const okNum = values[r.key] !== '' && Number.isFinite(n) && n >= 0 && n <= 100;
              return (
                <label key={r.key} className="block space-y-1.5">
                  <span className="text-[15px] font-medium text-slate-900">{r.label} — company pays</span>
                  <div className="relative">
                    <input
                      inputMode="decimal"
                      aria-label={`${r.label} — company pays`}
                      className={`h-12 w-full rounded-xl border px-4 pr-10 text-[15px] outline-none focus:border-[#0051d5] ${
                        badField === r.key ? 'border-rose-400' : 'border-slate-200'
                      }`}
                      value={values[r.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [r.key]: e.target.value }))}
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-slate-500">%</span>
                  </div>
                  <span className={`block text-[13px] ${badField === r.key ? 'text-rose-700' : 'text-slate-500'}`}>
                    {badField === r.key ? 'Enter a number from 0 to 100' : okNum ? `The driver pays the rest: ${pct(100 - n)}` : ' '}
                  </span>
                </label>
              );
            })}
            </div>
            {splitHint ? <p className="text-[13px] text-slate-500">{splitHint}</p> : null}

            <label className="block space-y-1.5">
              <span className="text-[15px] font-medium text-slate-900">Applies from</span>
              <div
                className={`flex h-12 items-center gap-3 rounded-xl border px-4 ${
                  fromError ? 'border-2 border-rose-600 bg-rose-50/60 text-rose-800' : 'border-slate-200'
                }`}
              >
                <CalendarDays className="h-5 w-5 shrink-0" />
                <select
                  aria-label="Applies from"
                  className="h-full w-full bg-transparent text-[15px] outline-none"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                >
                  {weekOptions.map((m) => (
                    <option key={m} value={m}>
                      Week of {weekOf(m)}
                    </option>
                  ))}
                </select>
                {fromError ? <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" /> : null}
              </div>
              {fromError ? (
                <span className="flex items-start gap-2 text-[14px] text-rose-700" data-testid="add-fuel-version-error">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {fromError}
                </span>
              ) : null}
            </label>

            <p className="flex items-start gap-3 rounded-2xl bg-[#eef4ff] px-4 py-3 text-[14px] text-[#0051d5]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Weeks before this date keep the rule they were locked with. Nothing already locked changes.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-12 rounded-xl border border-slate-200 px-5 text-[15px] font-medium text-slate-900 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!plan?.ok || saving}
            onClick={async () => {
              if (!plan?.ok) return;
              setSaving(true);
              try {
                await onSave(plan.scenario);
                onOpenChange(false);
              } catch {
                /* the error is shown; the dialog stays open */
              } finally {
                setSaving(false);
              }
            }}
            className="flex h-12 items-center gap-2 rounded-xl bg-[#030213] px-5 text-[15px] font-semibold text-white hover:bg-[#213145] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            <History className="h-4 w-4" /> Add version
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Read-only: the values that sort km between trips (F-30). */
export function HowRoamSortsKm({ policy }: { policy: BrainPolicy | null | undefined }) {
  const lines = brainLines(policy);
  if (!lines.length) return null;
  return (
    <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-5" data-testid="how-roam-sorts-km">
      <h4 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
        <Route className="h-4 w-4 text-slate-600" /> How Roam sorts the km
      </h4>
      <ul className="space-y-1 text-[14px] text-slate-700">
        {lines.map((l) => (
          <li key={l}>· {l}</li>
        ))}
      </ul>
      <p className="text-[12px] text-slate-500">Set by Roam. A locked week keeps the values it was worked out with.</p>
    </section>
  );
}
