// Stitch: docs/stitch/dominion-vehicles-home-dashboard (light / dark / states / phone 390px).
// Database-only dashboard: every number counts rows in Dominion, nothing comes from the apps.
import { useState, type ReactNode } from "react";
import { versionDifferenceLabel, versionYearsLabel } from "@roam/vehicle-catalog-core";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { PartsButton } from "../../parts-database/PartsButton";
import { MakerLogo } from "../MakerLogo";
import type { CatalogMakerSummary, VehiclesDashboard, VehiclesDashboardChange } from "../vehiclesCatalogApi";
import type { PartsOverview } from "../../parts-database/partsDatabaseApi";
import { rowFingerprint, VEHICLE_SEARCH_EXAMPLES } from "./vehiclesStitchShared";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DCode, DIcon, DIconTile } from "../../parts-database/add-parts/catalog/dominionKit";

type Props = {
  makers: CatalogMakerSummary[];
  items: VehicleCatalogRecord[];
  recentCars: VehicleCatalogRecord[];
  logoByMake: Map<string, string | null | undefined>;
  search: string;
  onSearch: (q: string) => void;
  filteredSearch: VehicleCatalogRecord[];
  dashboard: VehiclesDashboard | undefined;
  dashboardLoading: boolean;
  dashboardError: boolean;
  onRetryDashboard: () => void;
  overview: PartsOverview | undefined;
  overviewError: boolean;
  onRetryOverview: () => void;
  onOpenMaker: (make: string) => void;
  onOpenCar: (r: VehicleCatalogRecord, tab?: string) => void;
  onAddCar: () => void;
  onOpenLegacy: () => void;
  onReviewDuplicates: () => void;
  onReviewNoSpecs: () => void;
  onAddLogos: () => void;
  /** Go to another Dominion page (parts database, pending catalog). */
  onOpenPage: (page: string, params?: Record<string, string>) => void;
};

const nf = new Intl.NumberFormat("en-US");
const fmt = (n: number | undefined | null) => (n == null ? "—" : nf.format(n));

/** Key parts readiness colour: 8–10 green, 4–7 amber, 0–3 red. */
function readinessTone(keyParts: number) {
  if (keyParts >= 8) return { text: "text-[#006e31] dark:text-[#4ade80]", bar: "bg-[#006e31] dark:bg-[#4ade80]" };
  if (keyParts >= 4) return { text: "text-[#8a5a00] dark:text-[#fbbf24]", bar: "bg-[#8a5a00] dark:bg-[#fbbf24]" };
  return { text: "text-[#a83836] dark:text-[#f87171]", bar: "bg-[#a83836] dark:bg-[#f87171]" };
}

const RING = "ring-1 ring-inset ring-[#e6e7ee] dark:ring-[#1e293b]";
const ROW_HOVER = "transition-all hover:ring-[#0153dc] dark:hover:ring-[#5b8def] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0153dc]";
const TRACK = "bg-[#eef0f6] dark:bg-[#1e293b]";

function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const FIELD_WORDS: Record<string, string> = {
  engine_code: "engine code",
  chassis_code: "frame code",
  production_start_year: "years",
  production_end_year: "years",
  production_start_month: "years",
  production_end_month: "years",
  drivetrain: "drive",
  body_type: "body",
  fuel_type: "fuel",
  transmission: "gearbox",
  catalog_trim: "grade",
  trim_series: "grade",
  engine_displacement_cc: "engine size",
  status: "status",
  make: "maker",
  model: "model",
};

/** "specs edited", "engine code, years edited", "Brake fluid added". */
function changeText(ch: VehiclesDashboardChange): string {
  if (ch.kind === "spec") {
    return `${ch.specLabel || "A spec"} ${ch.action}`;
  }
  if (ch.action === "added") return "car added";
  if (ch.action === "removed") return "car removed";
  const words = [...new Set((ch.fields ?? []).map((f) => FIELD_WORDS[f] ?? f.replace(/_/g, " ")))];
  if (!words.length || words.length > 3) return "details edited";
  const shown = words.slice(0, 2).join(", ");
  return words.length > 2 ? `${words.slice(0, 2).join(", ")} and ${words[2]} edited` : `${shown} edited`;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${D_CARD} p-4 sm:p-6 ${className}`}>{children}</section>;
}

function CardHead({ title, hint, right }: { title: ReactNode; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 pb-4">
      <div className="min-w-0">
        <h2 className={`text-[18px] font-semibold leading-6 ${D_TXT}`}>{title}</h2>
        {hint ? <p className={`mt-0.5 text-[13px] ${D_MUTED}`}>{hint}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function SmallButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <PartsButton variant="secondary" className="!h-8 !px-3 text-[12px] font-semibold" onClick={onClick}>
      {children}
    </PartsButton>
  );
}

function ReadinessBar({ keyParts, showPercent }: { keyParts: number; showPercent?: boolean }) {
  const tone = readinessTone(keyParts);
  const pct = Math.max(0, Math.min(10, keyParts)) * 10;
  return (
    <div className="w-full">
      <div className={`mb-1 flex items-center justify-between text-[12px] font-medium ${tone.text}`}>
        <span>Key parts {keyParts} of 10</span>
        {showPercent ? <span>{pct}%</span> : null}
      </div>
      <div className={`h-1.5 w-full overflow-hidden rounded-full ${TRACK}`}>
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex animate-pulse flex-col gap-2.5" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`h-14 rounded-xl ${TRACK}`} />
      ))}
    </div>
  );
}

function SummaryTile({
  label,
  icon,
  value,
  hint,
  progress,
  amber,
  failed,
  onRetry,
  onClick,
}: {
  label: string;
  icon: string;
  value: string;
  hint: string;
  progress?: number;
  amber?: boolean;
  failed?: boolean;
  onRetry: () => void;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <span className={`text-[13px] ${D_MUTED}`}>{label}</span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            amber ? "bg-[#fff4dc] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]" : "bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]"
          }`}
        >
          <DIcon name={icon} className="text-[18px]" />
        </span>
      </div>
      <div className="mt-4">
        {failed ? (
          <div className="flex items-center gap-2">
            <span className={`text-[15px] ${D_MUTED}`}>Not loaded</span>
            <SmallButton onClick={onRetry}>Retry</SmallButton>
          </div>
        ) : (
          <>
            <div
              className={`text-[32px] font-semibold leading-tight ${D_MONO} ${
                amber ? "text-[#8a5a00] dark:text-[#fbbf24]" : D_TXT
              }`}
            >
              {value}
            </div>
            <div className={`mt-1 text-[13px] ${D_MUTED}`}>{hint}</div>
            {progress != null ? (
              <div className={`mt-2.5 h-1.5 w-full overflow-hidden rounded-full ${TRACK}`}>
                <div className="h-full rounded-full bg-[#0153dc] dark:bg-[#5b8def]" style={{ width: `${Math.max(progress, progress > 0 ? 1 : 0)}%` }} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
  const cls = `${D_CARD} flex flex-col justify-between p-5 text-left ${RING} border-0`;
  if (!onClick || failed) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={`${cls} ${amber ? "hover:ring-[#8a5a00]" : ""} ${ROW_HOVER}`} onClick={onClick}>
      {body}
    </button>
  );
}

export function VehiclesHomeScreen(props: Props) {
  const {
    makers,
    items,
    recentCars,
    logoByMake,
    search,
    onSearch,
    filteredSearch,
    dashboard,
    dashboardLoading,
    dashboardError,
    onRetryDashboard,
    overview,
    overviewError,
    onRetryOverview,
    onOpenMaker,
    onOpenCar,
    onAddCar,
    onOpenLegacy,
    onOpenPage,
  } = props;
  const [allMakers, setAllMakers] = useState(false);
  const [allComplete, setAllComplete] = useState(false);

  const byId = new Map(items.map((r) => [r.id, r]));
  const makerTotal = makers.length || new Set(items.map((r) => r.make.toLowerCase())).size;
  const sortedMakers = [...makers].sort((a, b) => (b.version_count ?? 0) - (a.version_count ?? 0));
  const shownMakers = allMakers ? sortedMakers : sortedMakers.slice(0, 6);

  const versions = overview?.vehicles ?? dashboard?.versions ?? items.length;
  const withParts = overview?.vehiclesWithParts;
  const withPartsPct = withParts != null && versions ? (withParts / versions) * 100 : 0;

  const readinessById = new Map((dashboard?.cars ?? []).map((c) => [c.id, c.keyParts]));
  for (const c of dashboard?.mostComplete ?? []) readinessById.set(c.id, c.keyParts);

  const mostComplete = (dashboard?.mostComplete ?? [])
    .map((c) => ({ ...c, car: byId.get(c.id) }))
    .filter((c): c is typeof c & { car: VehicleCatalogRecord } => Boolean(c.car));
  const shownComplete = allComplete ? mostComplete : mostComplete.slice(0, 3);

  const recentChanges = (dashboard?.recentChanges ?? [])
    .map((ch) => ({ ch, car: byId.get(ch.carId) }))
    .filter((x): x is { ch: VehiclesDashboardChange; car: VehicleCatalogRecord } => Boolean(x.car));

  const attention = (
    <NeedsAttention
      {...props}
      pendingApproval={dashboard?.pendingApproval ?? overview?.waiting ?? 0}
    />
  );

  return (
    <div className="vehicles-database-stitch parts-database-stitch flex flex-col">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-6 py-8 max-[390px]:gap-5 max-[390px]:px-4 max-[390px]:py-5">
        <div className="vehicles-home-header flex items-start justify-between gap-3 max-[390px]:flex-col">
          <div className="min-w-0 max-[390px]:w-full">
            <h1 className={`text-[26px] font-semibold tracking-tight ${D_TXT}`}>Vehicles</h1>
            <p className={`text-[15px] ${D_MUTED}`}>Every car Roam knows, and what each one needs.</p>
          </div>
          <div className="vehicles-home-header__actions flex shrink-0 gap-2 max-[390px]:grid max-[390px]:w-full max-[390px]:grid-cols-2">
            <PartsButton variant="secondary" onClick={onOpenLegacy}>
              <DIcon name="tune" className="text-[18px]" /> Import &amp; tools
            </PartsButton>
            <PartsButton variant="primary" onClick={onAddCar}>
              <DIcon name="add" className="text-[18px]" /> Add a car
            </PartsButton>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className={`relative flex w-full items-center rounded-xl bg-white shadow-[0_2px_8px_rgba(1,83,220,0.03)] ${RING} focus-within:ring-2 focus-within:ring-[#0153dc] dark:bg-[#111a2e]`}>
            <DIcon name="search" className="pointer-events-none absolute left-4 text-[22px] text-[#5d5f68] dark:text-[#94a3b8]" />
            <input
              className={`h-12 w-full rounded-xl bg-transparent pl-12 pr-4 text-[15px] placeholder:text-[#5d5f68] focus:outline-none dark:placeholder:text-[#94a3b8] ${D_TXT}`}
              placeholder="Search a car — e.g. Toyota Roomy 2019, M900A, 1KR-FE"
              aria-label="Search a car"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <span className={`select-none pr-1 text-[12px] ${D_MUTED}`}>Try:</span>
            {VEHICLE_SEARCH_EXAMPLES.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[12px] ${D_MUTED} ${RING} hover:text-[#30323b] dark:bg-[#111a2e] dark:hover:text-[#e2e8f0]`}
                onClick={() => onSearch(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {search.trim() && filteredSearch.length === 0 ? (
          <div className={`${D_CARD} flex flex-col items-center gap-3 p-10 text-center`}>
            <DIconTile name="search_off" tone="grey" />
            <p className={`text-[18px] font-semibold ${D_TXT}`}>No car matches &quot;{search.trim()}&quot;.</p>
            <PartsButton variant="primary" onClick={onAddCar}>
              <DIcon name="add" className="text-[18px]" /> Add a car
            </PartsButton>
          </div>
        ) : null}

        {filteredSearch.length > 0 ? (
          <ul className={`${D_CARD} divide-y divide-[#e6e7ee] overflow-hidden dark:divide-[#1e293b]`}>
            {filteredSearch.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-[#f9f9fd] dark:hover:bg-[#0b1220]"
                  onClick={() => onOpenCar(r)}
                >
                  <MakerLogo make={r.make} logoStoragePath={logoByMake.get(r.make.toLowerCase())} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-semibold ${D_TXT}`}>
                      {r.make} {r.model} · {versionYearsLabel(r.production_start_year, r.production_end_year)}
                    </span>
                    <span className={`block text-[13px] ${D_MUTED}`}>{versionDifferenceLabel(r)}</span>
                  </span>
                  {r.chassis_code ? <DCode>{r.chassis_code}</DCode> : null}
                  <DIcon name="chevron_right" className="text-[20px] text-[#5d5f68]" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {dashboardError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c9c8] bg-[#fdecec] px-4 py-3 dark:border-[#7f1d1d] dark:bg-[#450a0a]">
            <p className="flex items-center gap-2 text-[14px] font-medium text-[#a83836] dark:text-[#f87171]">
              <DIcon name="error" className="text-[20px]" /> Could not load the vehicles dashboard. Nothing was changed.
            </p>
            <SmallButton onClick={onRetryDashboard}>Try again</SmallButton>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryTile
            label="Car versions"
            icon="directions_car"
            value={fmt(versions)}
            hint={`across ${fmt(makerTotal)} makers`}
            failed={overviewError && !dashboard}
            onRetry={onRetryOverview}
            onClick={() => setAllMakers(true)}
          />
          <SummaryTile
            label="Cars with parts"
            icon="build"
            value={fmt(withParts)}
            hint={`of ${fmt(versions)} versions`}
            progress={withPartsPct}
            failed={overviewError}
            onRetry={onRetryOverview}
            onClick={() => onOpenPage("parts-catalog", { tab: "database" })}
          />
          <SummaryTile
            label="Parts on file"
            icon="inventory_2"
            value={fmt(overview?.partsOnFile)}
            hint="in the parts database"
            failed={overviewError}
            onRetry={onRetryOverview}
            onClick={() => onOpenPage("parts-catalog", { tab: "database" })}
          />
          <SummaryTile
            label="Waiting to check"
            icon="schedule"
            value={fmt(overview?.waiting)}
            hint="cars and parts for a person"
            amber={(overview?.waiting ?? 0) > 0}
            failed={overviewError}
            onRetry={onRetryOverview}
            onClick={() => onOpenPage("pending-motor-vehicles")}
          />
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-8">
            <div className="max-lg:order-first lg:hidden">{attention}</div>

            <Card className="max-lg:order-1">
              <CardHead
                title="How complete is the catalogue"
                hint={`Parts readiness across all ${fmt(dashboard?.versions ?? versions)} car versions`}
              />
              {dashboardLoading && !dashboard ? (
                <Skeleton rows={4} />
              ) : (
                <div className="flex flex-col gap-4">
                  <CompletenessBar dashboard={dashboard} />
                  <div className={`flex flex-wrap items-center gap-2 border-t border-[#e6e7ee] pt-3 text-[13px] dark:border-[#1e293b] ${D_MUTED}`}>
                    <span className={`font-medium ${D_TXT}`}>Car specs:</span>
                    <span className={`rounded-md bg-[#efedf3] px-2 py-0.5 text-[12px] font-medium dark:bg-[#1e293b] ${D_TXT}`}>
                      {fmt(dashboard?.withSpecs)} versions have specs
                    </span>
                    <span aria-hidden>·</span>
                    <span className="rounded-md bg-[#efedf3] px-2 py-0.5 text-[12px] font-medium dark:bg-[#1e293b]">
                      {fmt(dashboard?.withoutSpecs)} have none
                    </span>
                  </div>
                  <div className="pt-1">
                    <div className="flex items-center justify-between pb-3">
                      <h3 className={`text-[15px] font-semibold ${D_TXT}`}>Most complete cars</h3>
                      {mostComplete.length > 3 ? (
                        <SmallButton onClick={() => setAllComplete((v) => !v)}>{allComplete ? "Show fewer" : "See all"}</SmallButton>
                      ) : null}
                    </div>
                    {shownComplete.length === 0 ? (
                      <div className={`flex flex-col items-center gap-3 rounded-xl ${RING} p-6 text-center`}>
                        <p className={`text-[14px] ${D_MUTED}`}>No car has key parts on file yet.</p>
                        <PartsButton variant="primary" onClick={() => onOpenPage("parts-catalog", { tab: "add-parts" })}>
                          <DIcon name="add" className="text-[18px]" /> Add a part
                        </PartsButton>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {shownComplete.map(({ car, keyParts, specCount }) => (
                          <div
                            key={car.id}
                            role="button"
                            tabIndex={0}
                            className={`group flex cursor-pointer flex-col items-stretch justify-between gap-3 rounded-xl bg-white p-3.5 sm:flex-row sm:items-center dark:bg-[#111a2e] ${RING} ${ROW_HOVER}`}
                            onClick={() => onOpenCar(car)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onOpenCar(car);
                              }
                            }}
                          >
                            <div className="flex min-w-0 items-center gap-3.5">
                              <MakerLogo make={car.make} logoStoragePath={logoByMake.get(car.make.toLowerCase())} size={40} />
                              <div className="flex min-w-0 flex-col">
                                <div className="flex items-center gap-2">
                                  <span className={`truncate text-[15px] font-semibold ${D_TXT}`}>
                                    {car.make} {car.model}
                                  </span>
                                  {specCount > 0 ? (
                                    <button
                                      type="button"
                                      className={`shrink-0 rounded bg-[#efedf3] px-2 py-0.5 text-[11px] font-medium text-[#434655] ${RING} hover:bg-[#e3e2e7] dark:bg-[#1e293b] dark:text-[#cbd5e1]`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenCar(car, "specs");
                                      }}
                                    >
                                      {specCount} spec{specCount === 1 ? "" : "s"}
                                    </button>
                                  ) : null}
                                </div>
                                <span className={`text-[13px] ${D_MUTED}`}>
                                  {versionYearsLabel(car.production_start_year, car.production_end_year)} · {versionDifferenceLabel(car)}
                                </span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-4 pl-[54px] sm:pl-0">
                              <div className="w-full sm:w-28">
                                <ReadinessBar keyParts={keyParts} />
                              </div>
                              <DIcon name="chevron_right" className="text-[20px] text-[#5d5f68] group-hover:text-[#0153dc]" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>

            <Card className="max-lg:order-3">
              <CardHead
                title={
                  <span className="flex items-center gap-2">
                    Makers
                    <span className={`rounded-md bg-[#efedf3] px-2 py-0.5 text-[12px] font-medium dark:bg-[#1e293b] ${D_MONO} ${D_MUTED}`}>
                      {fmt(makerTotal)}
                    </span>
                  </span>
                }
                right={
                  makers.length > 6 ? (
                    <SmallButton onClick={() => setAllMakers((v) => !v)}>
                      {allMakers ? "Show top 6" : `All ${fmt(makers.length)} makers`}
                    </SmallButton>
                  ) : null
                }
              />
              {makers.length === 0 ? (
                <p className={`text-[14px] ${D_MUTED}`}>No makers on file yet.</p>
              ) : (
                <div className="vehicles-maker-tiles grid grid-cols-2 gap-3 md:grid-cols-3">
                  {shownMakers.map((m) => (
                    <button
                      key={m.make}
                      type="button"
                      className={`flex items-center gap-3 rounded-xl bg-white p-3 text-left dark:bg-[#111a2e] ${RING} ${ROW_HOVER}`}
                      onClick={() => onOpenMaker(m.make)}
                    >
                      <MakerLogo make={m.make} logoStoragePath={m.logo_storage_path} size={40} />
                      <span className="min-w-0">
                        <span className={`block truncate text-[15px] font-semibold ${D_TXT}`}>{m.make}</span>
                        <span className={`block text-[13px] ${D_MUTED}`}>{fmt(m.version_count ?? 0)} version{(m.version_count ?? 0) === 1 ? "" : "s"}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card className="max-lg:order-2">
              <CardHead title="Recently opened" hint="Quick access to your recent records" />
              {recentCars.length === 0 ? (
                <p className={`text-[14px] ${D_MUTED}`}>Cars you open will show here.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {recentCars.map((r) => {
                    const keyParts = readinessById.get(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`flex flex-col justify-between gap-3 rounded-xl bg-white p-4 text-left dark:bg-[#111a2e] ${RING} ${ROW_HOVER}`}
                        onClick={() => onOpenCar(r)}
                      >
                        <span className="flex w-full items-start justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <MakerLogo make={r.make} logoStoragePath={logoByMake.get(r.make.toLowerCase())} size={36} />
                            <span className="flex min-w-0 flex-col">
                              <span className={`truncate text-[15px] font-semibold ${D_TXT}`}>{r.make} {r.model}</span>
                              <span className={`text-[13px] ${D_MUTED}`}>
                                {versionYearsLabel(r.production_start_year, r.production_end_year)} · {versionDifferenceLabel(r)}
                              </span>
                            </span>
                          </span>
                          {r.chassis_code ? <DCode>{r.chassis_code}</DCode> : null}
                        </span>
                        {keyParts != null ? <ReadinessBar keyParts={keyParts} showPercent /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-4">
            <div className="hidden lg:block">{attention}</div>

            <Card>
              <CardHead
                title="Recently added parts"
                right={<SmallButton onClick={() => onOpenPage("parts-catalog", { tab: "database" })}>Open parts database</SmallButton>}
              />
              {dashboardLoading && !dashboard ? (
                <Skeleton rows={3} />
              ) : (dashboard?.recentParts ?? []).length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <p className={`text-[14px] ${D_MUTED}`}>No parts saved yet.</p>
                  <PartsButton variant="primary" onClick={() => onOpenPage("parts-catalog", { tab: "add-parts" })}>
                    <DIcon name="add" className="text-[18px]" /> Add a part
                  </PartsButton>
                </div>
              ) : (
                <div className="divide-y divide-[#e6e7ee] dark:divide-[#1e293b]">
                  {(dashboard?.recentParts ?? []).map((p) => {
                    const more = p.carCount - p.cars.length;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="group -mx-1.5 flex w-[calc(100%+0.75rem)] items-center justify-between rounded-lg px-1.5 py-3 text-left hover:bg-[#f5f3f9] dark:hover:bg-[#0b1220]"
                        onClick={() => onOpenPage("parts-catalog", { tab: "database", q: p.name })}
                      >
                        <span className="flex min-w-0 flex-col pr-2">
                          <span className={`truncate text-[14px] font-semibold group-hover:text-[#0153dc] ${D_TXT}`}>{p.name}</span>
                          <span className={`truncate text-[12px] ${D_MUTED}`}>
                            {p.cars.length ? p.cars.join(", ") : "No cars linked yet"}
                            {more > 0 ? ` +${more} more` : ""}
                          </span>
                        </span>
                        <span className={`shrink-0 text-[12px] ${D_MUTED}`}>{shortDate(p.at)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card>
              <CardHead title="Recently changed cars" />
              {dashboardLoading && !dashboard ? (
                <Skeleton rows={3} />
              ) : recentChanges.length === 0 ? (
                <p className={`text-[14px] ${D_MUTED}`}>No edits yet.</p>
              ) : (
                <div className="divide-y divide-[#e6e7ee] dark:divide-[#1e293b]">
                  {recentChanges.map(({ ch, car }) => (
                    <button
                      key={ch.id}
                      type="button"
                      className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-3 rounded-lg px-1.5 py-3 text-left hover:bg-[#f5f3f9] dark:hover:bg-[#0b1220]"
                      onClick={() => onOpenCar(car, ch.kind === "spec" ? "specs" : "history")}
                    >
                      <MakerLogo make={car.make} logoStoragePath={logoByMake.get(car.make.toLowerCase())} size={32} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={`truncate text-[14px] font-semibold ${D_TXT}`}>{car.make} {car.model}</span>
                        <span className={`text-[12px] ${D_MUTED}`}>
                          {versionYearsLabel(car.production_start_year, car.production_end_year)} · {versionDifferenceLabel(car)}
                        </span>
                        <span className={`mt-0.5 text-[13px] ${D_TXT}`}>{changeText(ch)}</span>
                      </span>
                      <span className={`shrink-0 text-right text-[12px] ${D_MUTED}`}>
                        {ch.actor ? <span className="block">{ch.actor}</span> : null}
                        {shortDate(ch.at)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompletenessBar({ dashboard }: { dashboard: VehiclesDashboard | undefined }) {
  const c = dashboard?.completeness ?? { high: 0, mid: 0, low: 0, none: 0 };
  const total = c.high + c.mid + c.low + c.none;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const parts = [
    { key: "high", label: "8–10 ready", n: c.high, dot: "bg-[#006e31] dark:bg-[#4ade80]" },
    { key: "mid", label: "4–7 ready", n: c.mid, dot: "bg-[#8a5a00] dark:bg-[#fbbf24]" },
    { key: "low", label: "1–3 ready", n: c.low, dot: "bg-[#a83836] dark:bg-[#f87171]" },
    { key: "none", label: "None yet", n: c.none, dot: "bg-[#8e95a5]" },
  ];
  return (
    <>
      <div
        className={`flex h-3 w-full overflow-hidden rounded-full ${TRACK}`}
        role="img"
        aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(", ")}
      >
        {parts.slice(0, 3).map((p) =>
          p.n > 0 ? <div key={p.key} className={`h-full ${p.dot}`} style={{ width: `${pct(p.n)}%`, minWidth: 4 }} /> : null,
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.key} className={`flex items-center gap-2 rounded-lg bg-white p-2 dark:bg-[#111a2e] ${RING}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.dot}`} />
            <span className={`truncate text-[12px] ${D_TXT}`}>
              <span className="font-semibold">{p.label}</span> · {fmt(p.n)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Kept from the old home: same rows and buttons, plus rows waiting for approval. */
function NeedsAttention({
  items,
  makers,
  pendingApproval,
  onReviewDuplicates,
  onReviewNoSpecs,
  onAddLogos,
  onOpenPage,
}: Props & { pendingApproval: number }) {
  const noLogoCount = makers.filter((m) => !m.logo_storage_path).length;
  const dupCount = (() => {
    const seen = new Map<string, number>();
    for (const r of items) {
      const k = rowFingerprint(r);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return [...seen.values()].filter((n) => n > 1).length;
  })();
  const noCodes = items.filter((r) => !r.engine_code && !r.chassis_code).length;

  const rows: Array<{ key: string; amber?: boolean; icon: string; text: string; action: string; onClick: () => void }> = [];
  if (dupCount > 0) rows.push({ key: "dup", amber: true, icon: "warning", text: `Looks like a duplicate · ${fmt(dupCount)} possible duplicate version${dupCount === 1 ? "" : "s"}`, action: "Review", onClick: onReviewDuplicates });
  if (noCodes > 0) rows.push({ key: "codes", icon: "description", text: `${fmt(noCodes)} car${noCodes === 1 ? " has" : "s have"} no engine or frame code yet`, action: "Review", onClick: onReviewNoSpecs });
  if (noLogoCount > 0) rows.push({ key: "logo", icon: "image", text: `${fmt(noLogoCount)} maker${noLogoCount === 1 ? " has" : "s have"} no logo`, action: "Add logos", onClick: onAddLogos });
  if (pendingApproval > 0) rows.push({ key: "pending", icon: "schedule", text: `${fmt(pendingApproval)} row${pendingApproval === 1 ? "" : "s"} waiting for approval`, action: "Open pending", onClick: () => onOpenPage("pending-motor-vehicles") });

  return (
    <Card>
      <CardHead
        title={
          <span className="flex items-center gap-2">
            Needs attention
            {rows.length ? (
              <span className="rounded-full bg-[#fdecec] px-2 py-0.5 text-[11px] font-semibold text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]">
                {rows.length}
              </span>
            ) : null}
          </span>
        }
      />
      {rows.length === 0 ? (
        <p className={`flex items-center gap-2 text-[14px] ${D_MUTED}`}>
          <DIcon name="check_circle" className="text-[20px] text-[#006e31] dark:text-[#4ade80]" /> Nothing needs attention right now.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div
              key={r.key}
              className={`flex items-center justify-between gap-2.5 rounded-xl p-3 ring-1 ring-inset ${
                r.amber
                  ? "bg-[#fff4dc] ring-[#f5dfb8] dark:bg-[#451a03] dark:ring-[#78350f]"
                  : "bg-[#f3f4f8] ring-[#e6e7ee] dark:bg-[#0b1220] dark:ring-[#1e293b]"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <DIcon
                  name={r.icon}
                  className={`shrink-0 text-[20px] ${r.amber ? "text-[#8a5a00] dark:text-[#fbbf24]" : "text-[#5d5f68] dark:text-[#94a3b8]"}`}
                />
                <span className={`text-[13px] leading-snug ${r.amber ? "font-medium text-[#8a5a00] dark:text-[#fbbf24]" : D_TXT}`}>{r.text}</span>
              </span>
              <SmallButton onClick={r.onClick}>{r.action}</SmallButton>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
