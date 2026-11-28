/**
 * Step 16e (28 Nov 2026): the Hard use rule. Each night Roam compares how far every car drives with the normal-use
 * baseline; a car doing at least the multiple (or mostly short trips) uses the car maker's shorter schedules.
 * The baseline only sorts the cars; the shorter numbers always come from the manual. Only the platform owner can
 * change a limit; every change is kept with who and when.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchHardUsePolicy, saveHardUsePolicy, type HardUsePolicy, type HardUsePolicyLogRow } from "./maintenanceMasterApi";
import { HARD_USE_FIELDS, baselineLine, fieldText, fieldValue, logChanges } from "./hardUseRuleModel";

export function HardUseRuleCard({ token, canChange }: { token: string; canChange: boolean }) {
  const [policy, setPolicy] = useState<HardUsePolicy | null>(null);
  const [log, setLog] = useState<HardUsePolicyLogRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchHardUsePolicy(token);
      setPolicy(res.policy);
      setLog(res.log);
      setDraft(Object.fromEntries(HARD_USE_FIELDS.map((f) => [f.key, fieldText(f, res.policy)])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the hard use rule.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = useMemo(() => {
    const patch: Partial<HardUsePolicy> = {};
    for (const f of HARD_USE_FIELDS) {
      const v = fieldValue(f, draft[f.key] ?? "");
      if (v != null && policy && Number(policy[f.key]) !== v) (patch as Record<string, number>)[f.key] = v;
    }
    return patch;
  }, [draft, policy]);
  const dirty = Object.keys(changed).length > 0;

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await saveHardUsePolicy(token, changed);
      toast.success("Hard use rule saved. Cars are checked again tonight.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mm-light-card mt-6 rounded-2xl border border-outline-variant/30 bg-white p-6" data-testid="hard-use-rule-card">
      <h2 className="font-headline text-headline-sm text-on-surface">Hard use rule</h2>
      <p className="mt-1 max-w-3xl text-sm text-on-surface-variant">
        Every night Roam compares how far each car drives with normal use. A car that drives much more, or mostly makes
        short trips, uses the car maker's shorter schedules. The shorter numbers always come from the manual.
      </p>

      {loading ? <p className="mt-4 text-sm text-on-surface-variant">Loading…</p> : null}
      {error ? <p className="mt-4 rounded-lg bg-error-container/20 px-3 py-2 text-sm text-error">{error}</p> : null}

      {!loading && !error && policy ? (
        <>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {HARD_USE_FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-on-surface-variant">{f.label}</span>
                <span className="flex min-h-[44px] items-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="w-24 min-w-0 bg-transparent font-code text-[15px] text-on-surface outline-none"
                    value={draft[f.key] ?? ""}
                    disabled={!canChange || saving}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    data-testid={`hard-use-${f.key}`}
                    aria-label={`${f.label} (${f.unit})`}
                  />
                  <span className="text-[13px] text-on-surface-variant">{f.unit}</span>
                </span>
                {f.key === "baseline_km_per_year" ? (
                  <span className="text-[12px] text-on-surface-variant">
                    {baselineLine(fieldValue(f, draft[f.key] ?? ""))}
                  </span>
                ) : null}
              </label>
            ))}
          </div>

          {canChange ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-[44px] rounded-lg bg-[#0153dc] px-5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!dirty || saving}
                onClick={() => void save()}
                data-testid="hard-use-save"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="min-h-[44px] rounded-lg border border-outline-variant/50 bg-white px-5 text-sm font-medium text-on-surface disabled:opacity-50"
                disabled={!dirty || saving}
                onClick={() => setDraft(Object.fromEntries(HARD_USE_FIELDS.map((f) => [f.key, fieldText(f, policy)])))}
              >
                Undo changes
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-on-surface-variant">Only the platform owner can change these.</p>
          )}

          <h3 className="mt-6 text-sm font-semibold text-on-surface">Changes</h3>
          {log.filter((l) => logChanges(l.before_json, l.after_json).length).length ? (
            <ul className="mt-2 space-y-2 text-[13px]" data-testid="hard-use-log">
              {log.map((l) => {
                const lines = logChanges(l.before_json, l.after_json);
                if (!lines.length) return null;
                return (
                  <li key={l.changed_at} className="border-b border-outline-variant/20 pb-2">
                    <p className="text-on-surface-variant">
                      {new Date(l.changed_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {` · ${l.changed_by_label ?? (l.changed_by ? "Staff" : "Roam setup")}`}
                    </p>
                    {lines.map((t) => (
                      <p key={t} className="text-on-surface">{t}</p>
                    ))}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-on-surface-variant">No changes yet.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
