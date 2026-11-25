/**
 * S4 Settings and health — Stitch screen 9. Engine on/off + Pause, practice mode (shadow) with its 20-in-a-row meter,
 * cost per job and today's spend against the cap, the fill goal with the expected finish, the identity-first line,
 * recent problems with Retry, and the link to Trusted sources (S5). No telemetry, no providers, no bypass words.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import {
  researchApi,
  type ResearchIncident,
  type ResearchNotice,
  type ResearchSettings,
  type ResearchSummary,
  type TrustedSite,
} from "../../../services/researchEngineService";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DIcon, PartsButton, RE_SOFT, ReError, RePill, ReSkeleton, pauseReasonText } from "./ReKit";
import { openTrustedSources } from "./ResearchNoticeBanners";
import { onTrack, shortDate, siteName, usd } from "./researchModel";

const SHADOW_GOAL = 20;
/**
 * RE-50: Google allows 1,500 grounded searches a day at US$0.014 each, so a cap above about US$21 a day can't buy more
 * research — only "grounding limit" pauses. The cap field refuses more (the server does too).
 */
export const CAP_CEILING_USD = 21;

function Toggle({ checked, onChange, disabled, testId, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId: string; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        checked ? "border-[#0153dc] bg-[#0153dc]" : "border-[#c5c6d0] bg-[#e1e1ed] dark:border-[#334155] dark:bg-[#1e293b]"
      } disabled:opacity-50`}
    >
      <span className={`absolute top-[2px] h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-[2px]"}`} />
    </button>
  );
}

function CardHead({ icon, title, right }: { icon: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <DIcon name={icon} className="text-[20px] text-[#0153dc] dark:text-[#93b4ff]" />
        <h2 className={`text-[16px] font-semibold ${D_TXT}`}>{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function ResearchSettingsHealth() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [settings, setSettings] = useState<ResearchSettings | null>(null);
  const [summary, setSummary] = useState<ResearchSummary | null>(null);
  const [incidents, setIncidents] = useState<ResearchIncident[]>([]);
  const [notices, setNotices] = useState<ResearchNotice[]>([]);
  const [sites, setSites] = useState<TrustedSite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [editGoal, setEditGoal] = useState(false);
  const [goal, setGoal] = useState("");
  const [editCap, setEditCap] = useState(false);
  const [capInput, setCapInput] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [s, sum, inc, n, st] = await Promise.all([
        researchApi.settings(token),
        researchApi.summary(token),
        researchApi.incidents(token),
        researchApi.notices(token).catch(() => []),
        researchApi.trustedSites(token).catch(() => []),
      ]);
      setSettings(s.settings);
      setSummary(sum);
      setIncidents(inc);
      setNotices(n);
      setSites(st);
      setGoal(sum.fillTargetDate ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load settings");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Parameters<typeof researchApi.patchSettings>[1], msg: string) {
    setBusy(true);
    try {
      await researchApi.patchSettings(token, body);
      toast.success(msg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function retry(id: string) {
    setBusy(true);
    try {
      await researchApi.retry(token, id);
      toast.success("Sent again");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't retry");
    } finally {
      setBusy(false);
    }
  }

  if (error && !settings) return <ReError title="Couldn't load settings" message={error} onRetry={() => void load()} />;
  if (!settings || !summary) return <ReSkeleton rows={4} />;

  const on = settings.enabled;
  const paused = settings.paused;
  const streak = Math.min(SHADOW_GOAL, Number(settings.shadow_approve_streak ?? summary.shadowStreak ?? 0));
  const cap = Number(summary.dailySpendUsd ?? settings.daily_spend_usd ?? 0);
  const spent = Number(summary.spendTodayUsd ?? 0);
  const spentPct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  // RE-37: how many jobs a day the cap buys at this week's cost per job.
  const perJob = Number(summary.costPerJob7dUsd ?? 0);
  const jobsPerDay = cap > 0 && perJob > 0 ? Math.floor(cap / perJob) : null;
  const capValue = Number(capInput);
  const capBad = capInput.trim() === "" || !Number.isFinite(capValue) || capValue < 0;
  const capTooHigh = !capBad && capValue > CAP_CEILING_USD;
  const track = onTrack(summary.fillTargetDate, summary.expectedFinishDate);
  const pending = summary.remainingJobs;
  const groups = { car_maker: 0, part_maker: 0, reference: 0 } as Record<string, number>;
  for (const s of sites) for (const k of new Set(s.makers.map((m) => m.kind))) groups[k] = (groups[k] ?? 0) + 1;

  const problemNotices = notices.filter((n) => n.kind !== "evidence_changed");

  return (
    <div className="flex flex-col gap-6" data-testid="research-settings">
      <div className="flex justify-end">
        <span className="flex items-center gap-2 rounded-full bg-[#ededf9] px-3 py-1.5 dark:bg-[#1e293b]" data-testid="queue-pending">
          <span className={`h-2.5 w-2.5 rounded-full ${paused || !on ? "bg-[#94a3b8]" : "animate-pulse bg-[#006e31]"}`} />
          <span className={`text-[12px] font-medium ${D_TXT}`}>
            Queue · {pending.toLocaleString("en-GB")} {pending === 1 ? "item" : "items"} pending
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Engine */}
        <div className={`${D_CARD} flex h-full flex-col justify-between p-6`} data-testid="engine-card">
          <div className="flex flex-col gap-4">
            <CardHead
              icon="precision_manufacturing"
              title="Engine"
              right={
                !on ? (
                  <RePill tone="grey">Off</RePill>
                ) : paused ? (
                  <RePill tone="grey">Paused</RePill>
                ) : (
                  <RePill tone="green" pulse>
                    Running
                  </RePill>
                )
              }
            />
            <div className={`flex items-center justify-between rounded-lg p-4 ${RE_SOFT}`}>
              <div className="flex flex-col">
                <span className={`text-[13px] font-semibold ${D_TXT}`}>Research engine on</span>
                <span className={`text-[13px] ${D_MUTED}`}>Roam looks up cars, specs and parts by itself</span>
              </div>
              <Toggle
                checked={on}
                disabled={busy}
                testId="engine-toggle"
                label="Research engine on"
                onChange={(v) => (v ? void patch({ enabled: true }, "Research engine on") : setConfirmOff(true))}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex flex-col">
                <span className={`text-[13px] font-medium ${D_TXT}`}>{paused ? "Paused" : "Pause for now"}</span>
                {paused ? <span className={`text-[12px] ${D_MUTED}`}>{pauseReasonText(settings.paused_reason, settings.auto_resume_at) ?? "You paused it."}</span> : null}
              </div>
              {paused ? (
                <PartsButton variant="primary" disabled={busy} data-testid="engine-resume" onClick={() => void patch({ paused: false }, "Research resumed")}>
                  <DIcon name="play_arrow" className="text-[16px]" /> Resume
                </PartsButton>
              ) : (
                <PartsButton variant="secondary" disabled={busy || !on} data-testid="engine-pause" onClick={() => void patch({ paused: true }, "Research paused")}>
                  <DIcon name="pause" className="text-[16px]" /> Pause
                </PartsButton>
              )}
            </div>
          </div>
          <div className={`mt-6 flex items-start gap-2 pt-2 ${D_MUTED}`}>
            <DIcon name="info" className="mt-0.5 shrink-0 text-[16px]" />
            <p className="text-[13px] leading-snug">
              When turned off or paused, running jobs finish safely and waiting jobs stay in the queue. Turning off asks first.
            </p>
          </div>
        </div>

        {/* Auto-add */}
        <div className={`${D_CARD} flex h-full flex-col justify-between p-6`} data-testid="auto-add-card">
          <div className="flex flex-col gap-4">
            <CardHead
              icon="bolt"
              title="Auto-add"
              right={settings.shadow_mode ? <RePill tone="grey" icon="school">Practice</RePill> : <RePill tone="green" icon="check">On</RePill>}
            />
            <div className={`flex items-center justify-between rounded-lg p-4 ${RE_SOFT}`}>
              <div className="flex flex-col pr-2">
                <span className={`text-[13px] font-semibold ${D_TXT}`}>Practice mode</span>
                <span className={`text-[13px] ${D_MUTED}`}>Roam suggests, you approve everything</span>
              </div>
              <Toggle
                checked={settings.shadow_mode}
                disabled={busy}
                testId="practice-toggle"
                label="Practice mode"
                onChange={(v) => void patch({ shadow_mode: v }, v ? "Practice mode on" : "Practice mode off")}
              />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between">
                <span className={`text-[13px] font-medium ${D_TXT}`}>Good answers in a row</span>
                <span className={`text-[13px] font-semibold text-[#0153dc] dark:text-[#93b4ff] ${D_MONO}`} data-testid="streak">
                  {streak} of {SHADOW_GOAL}
                </span>
              </div>
              <p className={`text-[12px] ${D_MUTED}`}>Ready to add on its own after {SHADOW_GOAL} good answers in a row.</p>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#ededf9] dark:bg-[#1e293b]">
                <div className="h-full rounded-full bg-[#0153dc]" style={{ width: `${(streak / SHADOW_GOAL) * 100}%` }} />
              </div>
            </div>
          </div>
          <div className={`mt-6 flex items-start gap-2 pt-2 ${D_MUTED}`}>
            <DIcon name="verified" className="mt-0.5 shrink-0 text-[16px] text-[#006e31]" />
            <p className="text-[13px] leading-snug">
              After practice, only items the source rule confirms are added on their own. Everything else still comes to you.
            </p>
          </div>
        </div>

        {/* Cost & progress */}
        <div className={`${D_CARD} flex h-full flex-col gap-4 p-6`} data-testid="cost-card">
          <CardHead
            icon="payments"
            title="Cost and progress"
            right={
              <span className={`rounded bg-[#ededf9] px-2 py-0.5 text-[13px] dark:bg-[#1e293b] ${D_MONO} ${D_MUTED}`} data-testid="cost-per-job">
                {summary.costPerJob7dUsd != null ? `${usd(summary.costPerJob7dUsd, 3)} / job` : "No jobs this week"}
              </span>
            }
          />
          <div className={`flex flex-col gap-2 rounded-lg p-4 ${RE_SOFT}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[13px] ${D_MUTED}`}>Spent today</span>
              <span className={`text-[13px] font-semibold ${D_MONO} ${D_TXT}`} data-testid="spend-today">
                {usd(spent)} <span className={`font-normal ${D_MUTED}`}>/ {usd(cap)} cap</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-[13px] ${D_MUTED}`} data-testid="jobs-per-day">
                {jobsPerDay != null ? `About ${jobsPerDay.toLocaleString("en-GB")} jobs a day at this cap.` : "Jobs a day: shown once jobs have run this week."}
              </span>
              {editCap ? null : (
                <PartsButton
                  variant="secondary"
                  className="!min-h-[32px] !px-2"
                  data-testid="cap-change"
                  onClick={() => {
                    setCapInput(String(cap));
                    setEditCap(true);
                  }}
                >
                  Change cap
                </PartsButton>
              )}
            </div>
            {editCap ? (
              <div className="flex flex-col gap-2" data-testid="cap-editor">
                <label className="flex items-center gap-2">
                  <span className={`text-[13px] ${D_TXT}`}>Daily cap (US$)</span>
                  <input
                    type="number"
                    min={0}
                    max={CAP_CEILING_USD}
                    step="0.05"
                    value={capInput}
                    onChange={(e) => setCapInput(e.target.value)}
                    className="h-10 w-28 rounded-lg border border-[#c5c6d0] bg-white px-2 text-[13px] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0]"
                    data-testid="cap-input"
                  />
                </label>
                {capTooHigh ? (
                  <p className="text-[13px] text-[#a83836]" data-testid="cap-too-high">
                    The most that helps is {usd(CAP_CEILING_USD)} a day: Google allows 1,500 searches a day. A higher cap only buys pauses.
                  </p>
                ) : !capBad && perJob > 0 ? (
                  <p className={`text-[13px] ${D_MUTED}`}>About {Math.floor(capValue / perJob).toLocaleString("en-GB")} jobs a day.</p>
                ) : null}
                <div className="flex gap-2">
                  <PartsButton
                    variant="primary"
                    className="!min-h-[44px]"
                    disabled={busy || capBad || capTooHigh}
                    data-testid="cap-save"
                    onClick={() => {
                      setEditCap(false);
                      void patch({ daily_spend_usd: Math.round(capValue * 100) / 100 }, "Cap saved");
                    }}
                  >
                    Save
                  </PartsButton>
                  <PartsButton variant="secondary" className="!min-h-[44px]" onClick={() => setEditCap(false)}>
                    Cancel
                  </PartsButton>
                </div>
              </div>
            ) : null}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#ededf9] dark:bg-[#1e293b]">
              <div className="h-full rounded-full bg-[#003ea9] dark:bg-[#5b8def]" style={{ width: `${spentPct}%` }} />
            </div>
            <span className={`text-[12px] ${D_MUTED}`}>Cost per job is the last 7 days, searches included.</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <DIcon name="flag" className="text-[16px] text-[#0153dc]" />
                {editGoal ? (
                  <span className="flex items-center gap-2">
                    <input
                      type="date"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      className="h-8 rounded-lg border border-[#c5c6d0] bg-white px-2 text-[13px] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0]"
                    />
                    <PartsButton
                      variant="primary"
                      className="!min-h-[30px]"
                      disabled={busy || !goal}
                      onClick={() => {
                        setEditGoal(false);
                        void patch({ fill_target_date: goal }, "Goal saved");
                      }}
                    >
                      Save
                    </PartsButton>
                    <PartsButton variant="secondary" className="!min-h-[30px]" onClick={() => setEditGoal(false)}>
                      Cancel
                    </PartsButton>
                  </span>
                ) : (
                  <>
                    <span className={`text-[13px] font-medium ${D_TXT}`} data-testid="fill-goal">
                      {summary.fillTargetDate ? `Fill most-used cars by ${shortDate(summary.fillTargetDate)}` : "No fill goal set"}
                    </span>
                    <PartsButton variant="secondary" className="!min-h-[26px] !px-2" onClick={() => setEditGoal(true)}>
                      Change
                    </PartsButton>
                  </>
                )}
              </div>
              {track === true ? <RePill tone="green" icon="check">On track</RePill> : track === false ? <RePill tone="amber">Behind</RePill> : null}
            </div>
            <p className={`text-[12px] ${D_MUTED}`} data-testid="expected-finish">
              {summary.expectedFinishDate
                ? `At this week's pace the queue is done by ${shortDate(summary.expectedFinishDate)}.`
                : "No finish date yet — nothing has run this week."}
            </p>
            <div className={`flex items-center justify-between rounded-lg bg-[#e7e7f3]/40 p-2.5 text-[13px] dark:bg-[#1e293b] ${D_MUTED}`} data-testid="identity-first">
              <span>Cars without a frame code (identity first):</span>
              <span className={`font-bold text-[#0153dc] dark:text-[#93b4ff] ${D_MONO}`}>{summary.carsWithoutFrameCode.toLocaleString("en-GB")}</span>
            </div>
          </div>
        </div>

        {/* Recent problems */}
        <div className={`${D_CARD} flex h-full flex-col gap-4 p-6`} data-testid="problems-card">
          <CardHead
            icon="warning"
            title="Recent problems"
            right={<RePill tone={incidents.length + problemNotices.length ? "red" : "grey"}>{incidents.length + problemNotices.length} open</RePill>}
          />
          <div className="flex flex-col gap-2">
            {problemNotices.map((n) => (
              <div key={n.id} className={`flex flex-col justify-between gap-2 rounded-lg p-2 sm:flex-row sm:items-center ${RE_SOFT}`} data-testid="problem-notice">
                <div className="flex items-start gap-2.5">
                  <DIcon name={n.kind === "site_blocked" ? "block" : "schedule"} className="mt-0.5 shrink-0 text-[18px] text-[#8a5a00]" />
                  <span className={`text-[13px] font-medium ${D_TXT}`}>
                    {n.kind === "site_blocked"
                      ? `${siteName(n.subject)} blocks Roam — its items are now browser checks`
                      : pauseReasonText(n.reason ?? settings.paused_reason, settings.auto_resume_at) ?? "Research is paused"}
                  </span>
                </div>
                {n.kind === "site_blocked" ? (
                  <RePill tone="blue">Browser check site</RePill>
                ) : paused ? (
                  <PartsButton variant="secondary" className="!min-h-[30px]" disabled={busy} onClick={() => void patch({ paused: false }, "Research resumed")}>
                    Resume
                  </PartsButton>
                ) : null}
              </div>
            ))}
            {incidents.map((i) => (
              <div key={i.id} className={`flex flex-col justify-between gap-2 rounded-lg p-2 sm:flex-row sm:items-center ${RE_SOFT}`} data-testid="problem-incident">
                <div className="flex min-w-0 items-start gap-2.5">
                  <DIcon name="error" className="mt-0.5 shrink-0 text-[18px] text-[#a83836]" />
                  <div className="flex min-w-0 flex-col">
                    <span className={`truncate text-[13px] font-medium ${D_TXT}`}>{i.last_error ?? "A job stopped"}</span>
                    <span className={`text-[12px] ${D_MUTED}`}>
                      {i.state === "failed" ? "Failed" : "Waiting to retry"} · {i.attempts} {i.attempts === 1 ? "try" : "tries"}
                    </span>
                  </div>
                </div>
                <PartsButton variant="secondary" className="!min-h-[30px] shrink-0" disabled={busy} onClick={() => void retry(i.id)} data-testid="incident-retry">
                  <DIcon name="refresh" className="text-[14px]" /> Retry
                </PartsButton>
              </div>
            ))}
            {incidents.length + problemNotices.length === 0 ? <p className={`text-[13px] ${D_MUTED}`}>No problems in the last day.</p> : null}
          </div>
        </div>
      </div>

      {/* Trusted sources link (S5) */}
      <div className={`${D_CARD} flex flex-col items-start justify-between gap-4 p-6 md:flex-row md:items-center`} data-testid="trusted-link-card">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/40 dark:text-[#93b4ff]">
            <DIcon name="verified_user" className="text-[20px]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className={`text-[16px] font-semibold ${D_TXT}`}>Trusted sources</span>
              <span className={`rounded-full bg-[#ededf9] px-2 py-0.5 text-[11px] dark:bg-[#1e293b] ${D_MONO} ${D_MUTED}`}>{sites.length} sites</span>
            </div>
            <p className={`mt-0.5 text-[13px] ${D_MUTED}`}>
              {groups.car_maker} car maker · {groups.part_maker} part maker · {groups.reference} reference
            </p>
          </div>
        </div>
        <PartsButton variant="secondary" className="!min-h-[40px]" onClick={openTrustedSources} data-testid="manage-trusted-sites">
          <DIcon name="tune" className="text-[16px]" /> Manage trusted sites <DIcon name="arrow_forward" className="text-[16px]" />
        </PartsButton>
      </div>

      {confirmOff ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#191b24]/40 p-4" role="dialog" aria-modal data-testid="engine-off-dialog">
          <div className={`${D_CARD} flex w-full max-w-md flex-col gap-3 p-5 shadow-xl`}>
            <h2 className={`text-[16px] font-semibold ${D_TXT}`}>Turn the research engine off?</h2>
            <p className={`text-[13px] ${D_MUTED}`}>Running jobs finish safely. Waiting jobs stay in the queue until you turn it back on.</p>
            <div className="flex justify-end gap-2 pt-2">
              <PartsButton variant="secondary" onClick={() => setConfirmOff(false)}>
                Keep it on
              </PartsButton>
              <PartsButton
                variant="danger"
                confirm
                disabled={busy}
                onClick={() => {
                  setConfirmOff(false);
                  void patch({ enabled: false }, "Research engine off");
                }}
              >
                Turn off
              </PartsButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
