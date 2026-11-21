/**
 * S6 Vehicle Catalog → car page → Coverage tab — Stitch screens 13 (coverage) and 14 (identity first).
 * Tiles: the 10 core part types + the core spec keys, each with its state and one action (audit §4 S6).
 * Values come from parts_for_vehicle / catalog_spec_value with their trust; states from readiness + the latest job.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import { researchApi, type CarCoverage, type CoveragePart, type CoverageSpec } from "../../../services/researchEngineService";
import { ResearchJobDrawer } from "./ResearchJobDrawer";
import {
  D_CARD,
  D_MONO,
  D_MUTED,
  D_TXT,
  DIcon,
  PartsButton,
  RE_SOFT,
  ReError,
  RePill,
  ReSkeleton,
  ReToast,
} from "./ReKit";
import { partTileState, siteName, specTileState, TILE_META, tileSummary, type TileState } from "./researchModel";

const AREA: Record<string, { label: string; icon: string }> = {
  ENG: { label: "Engine", icon: "oil_barrel" },
  FILT: { label: "Intake", icon: "air" },
  HVAC: { label: "Cabin air", icon: "hvac" },
  BRK: { label: "Brakes", icon: "album" },
  BELT: { label: "Engine", icon: "settings" },
  LGT: { label: "Wipers", icon: "water_drop" },
  SUS: { label: "Suspension", icon: "height" },
};

export function areaOf(opCode: string): { label: string; icon: string } {
  return AREA[opCode.split("-")[0]] ?? { label: "Part", icon: "build" };
}

type Props = {
  carId: string;
  make: string;
  model: string;
  /** Opens the car page's "Parts on file" tab (Confirmed → Open). */
  onOpenParts: () => void;
};

export function CarCoverageTab({ carId, make, model, onOpenParts }: Props) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [cov, setCov] = useState<CarCoverage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawerJob, setDrawerJob] = useState<{ jobId: string; title: string } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setCov(await researchApi.coverage(token, carId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load coverage");
    }
  }, [token, carId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      setToastMsg(msg);
      await fn();
      await load();
    } catch (e) {
      setToastMsg(null);
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const identityMissing = Boolean(cov && !cov.chassisCode);
  const partStates = useMemo(() => (cov?.parts ?? []).map((p) => partTileState(p, identityMissing)), [cov, identityMissing]);
  const specStates = useMemo(() => (cov?.specs ?? []).map((s) => specTileState(s, identityMissing)), [cov, identityMissing]);

  if (error && !cov) return <ReError title="Couldn't load coverage" message={error} onRetry={() => void load()} />;
  if (!cov) return <ReSkeleton rows={4} testId="coverage-loading" />;

  const ready = identityMissing ? 0 : cov.partsReady;
  const total = cov.parts.length || 10;
  const pct = Math.round((ready / total) * 100);

  function partAction(p: CoveragePart, state: TileState) {
    const meta = TILE_META[state];
    if (!meta.action) return null;
    const click = () => {
      switch (meta.action) {
        case "open":
          onOpenParts();
          break;
        case "review":
        case "open_browser_check":
        case "choose":
          if (p.jobId) setDrawerJob({ jobId: p.jobId, title: p.name });
          else onOpenParts();
          break;
        case "research_part":
          void run(() => researchApi.fillItem(token, { vehicleCatalogId: carId, componentId: p.componentId }), `${p.name} is in the queue`);
          break;
        case "research_again":
          void run(
            () => (p.jobId ? researchApi.retry(token, p.jobId) : researchApi.fillItem(token, { vehicleCatalogId: carId, componentId: p.componentId })),
            `${p.name} is back in the queue`,
          );
          break;
      }
    };
    return (
      <PartsButton
        variant={meta.action === "review" || meta.action === "choose" ? "primary" : "secondary"}
        className="!min-h-[30px]"
        disabled={busy}
        onClick={click}
        data-testid={`tile-action-${meta.action}`}
      >
        {meta.actionLabel}
      </PartsButton>
    );
  }

  function specAction(s: CoverageSpec, state: TileState) {
    const meta = TILE_META[state];
    if (!meta.action) return null;
    const label = meta.action === "research_part" ? "Research this spec" : meta.actionLabel;
    const click = () => {
      if (meta.action === "open") return;
      if ((meta.action === "review" || meta.action === "open_browser_check") && s.jobId) {
        setDrawerJob({ jobId: s.jobId, title: s.label });
        return;
      }
      if (meta.action === "research_again" && s.jobId) {
        void run(() => researchApi.retry(token, s.jobId!), `${s.label} is back in the queue`);
        return;
      }
      void run(() => researchApi.fillItem(token, { vehicleCatalogId: carId, specKey: s.specKey }), `${s.label} is in the queue`);
    };
    if (meta.action === "open") return null;
    return (
      <PartsButton variant={meta.action === "review" ? "primary" : "secondary"} className="!min-h-[30px]" disabled={busy} onClick={click} data-testid={`spec-action-${meta.action}`}>
        {label}
      </PartsButton>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="car-coverage">
      {toastMsg ? <ReToast onClose={() => setToastMsg(null)}>{toastMsg}</ReToast> : null}

      <div className={`${D_CARD} flex flex-col justify-between gap-6 p-6 lg:flex-row lg:items-center`}>
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2 ${RE_SOFT}`} data-testid="coverage-ring">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e1e1ed" strokeWidth="4" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#0153dc" strokeWidth="4" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} strokeLinecap="round" />
            </svg>
            <span className={`absolute text-[11px] font-bold text-[#0153dc] ${D_MONO}`}>{pct}%</span>
          </div>
          <div className="flex flex-col">
            <span className={`text-[16px] font-semibold ${D_TXT}`}>
              {ready} of {total}
            </span>
            <span className={`text-[12px] ${D_MUTED}`}>key parts ready</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PartsButton variant="secondary" className="!min-h-[40px]" disabled={busy} onClick={() => void run(() => researchApi.researchModel(token, make, model), `Roam is researching every ${make} ${model} version`)} data-testid="research-this-model">
            <DIcon name="manage_search" className="text-[18px]" /> Research this model
          </PartsButton>
          <PartsButton variant="secondary" className="!min-h-[40px]" disabled={busy} onClick={() => void run(() => researchApi.fillModel(token, make, model), `Every ${model} version is in the queue`)} data-testid="fill-every-version">
            <DIcon name="auto_mode" className="text-[18px]" /> Fill every {model} version
          </PartsButton>
          <PartsButton
            variant="primary"
            className="!min-h-[40px]"
            disabled={busy}
            data-testid="fill-this-car"
            onClick={() =>
              void run(async () => {
                const r = await researchApi.fillCar(token, carId);
                if (r.result.identityFirst) setToastMsg("Roam is finding this car's frame code first. The parts and specs follow.");
              }, "This car's missing parts and specs are in the queue")
            }
          >
            <DIcon name="auto_fix_high" className="text-[18px]" /> Fill this car
          </PartsButton>
        </div>
      </div>

      {identityMissing ? (
        <div className="flex flex-col gap-2" data-testid="identity-first">
          <div className="flex flex-col items-start justify-between gap-4 rounded-xl bg-[#f1f5f9] p-6 md:flex-row md:items-center dark:bg-[#1e293b]">
            <div className="flex items-center gap-3">
              <DIcon name="fingerprint" className="text-[24px] text-[#475569] dark:text-[#94a3b8]" />
              <p className={`text-[15px] font-medium ${D_TXT}`}>Roam needs this car&apos;s frame code before it can look up parts.</p>
            </div>
            <PartsButton
              variant="primary"
              className="!min-h-[40px]"
              disabled={busy}
              data-testid="find-identity"
              onClick={() => void run(() => researchApi.researchIdentity(token, carId), "Roam is finding this car's identity")}
            >
              <DIcon name="travel_explore" className="text-[18px]" /> Find this car&apos;s identity
            </PartsButton>
          </div>
          <p className={`text-[13px] ${D_MUTED}`}>Once the frame code is found, Roam looks up the parts and specs below.</p>
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e7e7f3] text-[#0153dc] dark:bg-[#1e293b]">
              <DIcon name="construction" className="text-[20px]" />
            </div>
            <h2 className={`text-[18px] font-semibold ${D_TXT}`}>Key parts</h2>
          </div>
          <SummaryChips states={partStates} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cov.parts.map((p, i) => {
            const state = partStates[i];
            const meta = TILE_META[state];
            const area = areaOf(p.opCode);
            const muted = state === "not_applicable";
            return (
              <div
                key={p.componentId}
                className={`${D_CARD} flex flex-col justify-between p-4 ${muted ? "opacity-60" : ""}`}
                data-testid="coverage-tile"
                data-state={state}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-[12px] font-medium uppercase tracking-wider ${D_MUTED}`}>
                      {String(i + 1).padStart(2, "0")} · {area.label}
                    </span>
                    <RePill tone={meta.tone} pulse={state === "researching"}>
                      {meta.label}
                    </RePill>
                  </div>
                  <h3 className={`text-[16px] font-semibold ${D_TXT}`}>{p.name}</h3>
                  <div className="flex items-center gap-1.5">
                    <DIcon name={area.icon} className={`text-[16px] ${D_MUTED}`} />
                    {p.partNumber && !identityMissing ? (
                      <span className={`text-[13px] font-semibold text-[#003ea9] dark:text-[#93b4ff] ${D_MONO}`}>
                        {[p.maker, p.partNumber].filter(Boolean).join(" ")}
                      </span>
                    ) : (
                      <span className={`text-[13px] ${D_MUTED}`}>Not on file</span>
                    )}
                  </div>
                  {!identityMissing && p.sourceUrl ? (
                    <div className={`flex items-center justify-between rounded-lg p-2 text-[11px] ${RE_SOFT} ${D_MUTED}`}>
                      <span>Source</span>
                      <span className={`max-w-[120px] truncate font-medium ${D_TXT}`}>{siteName(p.sourceUrl)}</span>
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 flex justify-end">{partAction(p, state)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e7e7f3] text-[#0153dc] dark:bg-[#1e293b]">
              <DIcon name="tune" className="text-[20px]" />
            </div>
            <h2 className={`text-[18px] font-semibold ${D_TXT}`}>Specs</h2>
          </div>
          <SummaryChips states={specStates} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {cov.specs.map((s, i) => {
            const state = specStates[i];
            const meta = TILE_META[state];
            return (
              <div key={s.specKey} className={`${D_CARD} flex flex-col justify-between p-4`} data-testid="spec-tile" data-state={state}>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[12px] font-semibold uppercase tracking-wider ${D_MUTED}`}>{s.label}</span>
                    <RePill tone={meta.tone} pulse={state === "researching"}>
                      {meta.label}
                    </RePill>
                  </div>
                  <div className={`mt-2 text-[16px] font-semibold ${s.value && !identityMissing ? D_TXT : D_MUTED}`}>
                    {s.value && !identityMissing ? [s.value, s.unit].filter(Boolean).join(" ") : "Not on file"}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">{specAction(s, state)}</div>
              </div>
            );
          })}
        </div>
      </section>

      {drawerJob ? (
        <ResearchJobDrawer
          token={token}
          jobId={drawerJob.jobId}
          fallbackTitle={drawerJob.title}
          onClose={() => setDrawerJob(null)}
          onChanged={(o) => {
            if (o) setToastMsg(o.message);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryChips({ states }: { states: TileState[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="coverage-summary">
      {tileSummary(states).map(({ state, count }) => (
        <RePill key={state} tone={TILE_META[state].tone} pulse={state === "researching"}>
          {count} {TILE_META[state].label}
        </RePill>
      ))}
    </div>
  );
}
