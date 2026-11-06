// Stitch AP12 — position + spec blocks catalog (13 frames)
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { MaterialIcon } from "../import/MaterialIcon";
import { fetchSelfServePartTypes, upsertPartType } from "./addPartsApi";
import { exportPartTypesSpecsJson } from "./addPartsPipelineActions";
import { emptyDraft } from "./addPartsTypes";
import {
  AxlePositionButtons,
  CatalystPositionButtons,
  ChassisCornerDiagram,
  PositionChips,
} from "./Step2FitBlock";

type CategoryFilter = "all" | "brakes" | "suspension" | "lighting" | "fluids" | "engine_belts";

const CATEGORY_CHIPS: Array<{ id: CategoryFilter; label: string }> = [
  { id: "all", label: "All (13)" },
  { id: "brakes", label: "Brakes (1)" },
  { id: "suspension", label: "Suspension (2)" },
  { id: "lighting", label: "Lighting (3)" },
  { id: "fluids", label: "Fluids (4)" },
  { id: "engine_belts", label: "Engine & Belts (3)" },
];

function LivePreview({ text }: { text: string }) {
  return (
    <div className="mt-space-lg pt-space-sm bg-surface-container-low rounded-lg p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        <span className="font-label-xs text-label-xs font-semibold text-primary uppercase tracking-wide">Live Catalog Preview</span>
      </div>
      <p className="font-mono-sm text-mono-sm text-on-surface mt-1">{text}</p>
    </div>
  );
}

function CardShell({
  categoryLine,
  title,
  badge,
  category,
  filter,
  children,
  preview,
}: {
  categoryLine: string;
  title: string;
  badge: string;
  category: Exclude<CategoryFilter, "all">;
  filter: CategoryFilter;
  children: ReactNode;
  preview: string;
}) {
  if (filter !== "all" && filter !== category) return null;
  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between mb-space-sm">
          <div>
            <span className="font-mono-sm text-mono-sm text-primary uppercase font-bold tracking-wider">{categoryLine}</span>
            <h3 className="font-headline-md text-headline-md text-on-surface mt-0.5">{title}</h3>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-mono-sm text-mono-sm">{badge}</span>
        </div>
        {children}
      </div>
      <LivePreview text={preview} />
    </div>
  );
}

export function PositionSpecCatalog() {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [draft, setDraft] = useState(emptyDraft());
  const qc = useQueryClient();
  const typesQuery = useQuery({ queryKey: ["self-serve-part-types"], queryFn: fetchSelfServePartTypes });
  const [committing, setCommitting] = useState(false);

  const visibleCount = useMemo(() => {
    if (filter === "all") return 13;
    const map: Record<Exclude<CategoryFilter, "all">, number> = {
      brakes: 1,
      suspension: 2,
      lighting: 3,
      fluids: 4,
      engine_belts: 3,
    };
    return map[filter];
  }, [filter]);

  async function onSyncSchema() {
    await qc.invalidateQueries({ queryKey: ["self-serve-part-types"] });
    await typesQuery.refetch();
    toast.success("Schema refreshed");
  }

  function onExportSpecs() {
    const types = typesQuery.data ?? [];
    if (!types.length) {
      toast.error("No part types loaded");
      return;
    }
    exportPartTypesSpecsJson(types);
    toast.success("Specs JSON downloaded");
  }

  async function onCommitTemplates() {
    const types = typesQuery.data ?? [];
    if (!types.length) {
      toast.error("No part types to commit");
      return;
    }
    setCommitting(true);
    try {
      let count = 0;
      for (const t of types) {
        await upsertPartType(
          {
            name: t.name,
            opCode: t.opCode,
            defaultFitMode: t.defaultFitMode,
            positionScheme: t.positionScheme,
            specFields: t.specFields,
          },
          t.id,
        );
        count += 1;
      }
      toast.success(`Committed ${count} catalog template${count === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="max-w-[1520px] mx-auto flex flex-col gap-space-xl">
      <div className="w-full bg-surface-container-lowest px-space-xl py-space-lg shadow-sm rounded-xl">
        <div className="flex flex-col gap-space-sm">
          <div className="flex items-center gap-space-sm flex-wrap">
            <span className="font-mono-sm text-mono-sm text-outline uppercase tracking-wider">Catalog Schema</span>
            <span className="text-outline text-label-xs">/</span>
            <span className="font-mono-sm text-mono-sm text-outline uppercase tracking-wider">Master Data</span>
            <span className="text-outline text-label-xs">/</span>
            <span className="font-mono-sm text-mono-sm text-primary uppercase font-semibold">AP12 Specification Rules</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
            <div>
              <h1 className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">
                Add parts — Position &amp; spec component catalog (AP12)
              </h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                Modular Step 2 blocks tailored for every automotive category in the 11-area taxonomy.
              </p>
            </div>
            <div className="flex items-center gap-space-sm self-start md:self-auto flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container font-mono-sm text-mono-sm text-on-surface">
                <span className="w-2 h-2 rounded-full bg-primary-container" />
                13 TAXON PATTERNS VALIDATED
              </div>
              <button
                type="button"
                className="px-space-md py-1.5 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md transition-colors flex items-center gap-1.5 shadow-sm"
                onClick={() => { void onSyncSchema(); }}
              >
                <MaterialIcon name="sync_alt" className="text-[16px]" />
                Sync Schema v4.8
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline mr-2 font-bold">Categories:</span>
          {CATEGORY_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={
                filter === chip.id
                  ? "px-2.5 py-1 rounded-full bg-primary-container text-on-primary font-mono-sm text-mono-sm font-medium"
                  : "px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-surface-variant text-on-surface-variant font-mono-sm text-mono-sm transition-colors"
              }
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 font-mono-sm text-mono-sm text-on-surface-variant">
          <MaterialIcon name="tune" className="text-[16px] text-outline" />
          Interactive Sandbox Mode · {visibleCount} frame{visibleCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-lg">
        <CardShell
          filter={filter}
          category="brakes"
          categoryLine="Brakes · Specific cars"
          title="Brake rotor · Position"
          badge="AP-01"
          preview="14 car versions have 246mm ventilated front rotors."
        >
          <div className="mt-space-md">
            <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1.5 font-bold">Axle placement</span>
            <AxlePositionButtons position={draft.position || "front"} onPick={(p) => setDraft({ ...draft, position: p, side: "" })} />
          </div>
          <div className="mt-space-sm flex items-start gap-1.5 text-on-surface-variant">
            <MaterialIcon name="info" className="text-[15px] text-outline mt-0.5" />
            <p className="font-body-sm text-body-sm leading-snug">Rotors are changed as an axle pair.</p>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="suspension"
          categoryLine="Suspension · Specific cars"
          title="Shock absorber · Corner positions"
          badge="AP-02"
          preview="Fits front axle pair on Toyota Roomy &amp; Tank (M900A)."
        >
          <div className="mt-space-md p-space-sm rounded-lg bg-surface-container-low relative">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline font-bold">Chassis Blueprint</span>
              <span className="font-mono-sm text-mono-sm text-primary font-semibold">Axle Pair: Front</span>
            </div>
            <ChassisCornerDiagram position={draft.position} side={draft.side} onPick={(p, s) => setDraft({ ...draft, position: p, side: s })} />
          </div>
          <div className="mt-space-sm flex items-start gap-1.5">
            <MaterialIcon name="info" className="text-[15px] text-outline mt-0.5" />
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug">
              Pick every corner the page lists. Left and right are often different part numbers.
            </p>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="suspension"
          categoryLine="Suspension · Specific cars"
          title="Suspension links &amp; arms"
          badge="AP-03"
          preview="Front left stabiliser link matched to 8 chassis variants."
        >
          <div className="mt-space-md flex flex-col gap-space-sm">
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Which part?</span>
              <div className="relative">
                <select className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg px-3 py-1.5 outline-none focus:bg-surface-container-lowest appearance-none cursor-pointer">
                  <option>Stabiliser link</option>
                  <option>Control arm</option>
                  <option>Bush</option>
                  <option>Ball joint</option>
                  <option>Tie rod end</option>
                </select>
                <MaterialIcon name="expand_more" className="absolute right-2.5 top-2 text-[18px] text-outline pointer-events-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Axle</span>
                <div className="flex gap-1">
                  <button type="button" className="flex-1 py-1 rounded bg-primary-container text-on-primary font-mono-sm text-mono-sm font-semibold">Front</button>
                  <button type="button" className="flex-1 py-1 rounded bg-surface-container text-on-surface font-mono-sm text-mono-sm">Rear</button>
                </div>
              </div>
              <div>
                <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Side</span>
                <div className="flex gap-1">
                  <button type="button" className="flex-1 py-1 rounded bg-primary-container text-on-primary font-mono-sm text-mono-sm font-semibold">Left</button>
                  <button type="button" className="flex-1 py-1 rounded bg-surface-container text-on-surface font-mono-sm text-mono-sm">Right</button>
                </div>
              </div>
            </div>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="engine_belts"
          categoryLine="Engine · By engine"
          title="Oxygen sensor · Exhaust position"
          badge="AP-04"
          preview="3 car versions have engine 1KR-FE with O2 before catalyst."
        >
          <div className="mt-space-md">
            <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1.5 font-bold">Sensor mounting stream</span>
            <CatalystPositionButtons position={draft.position || "before_cat"} onPick={(p) => setDraft({ ...draft, position: p, side: "" })} />
          </div>
          <div className="mt-space-sm flex items-center gap-1.5 font-mono-sm text-mono-sm text-on-surface-variant">
            <span className="px-1.5 py-0.5 rounded bg-surface-container-high font-semibold">1KR-FE</span>
            Bank 1 / Sensor 1 configuration
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="lighting"
          categoryLine="Lighting · By size or spec"
          title="Indicator bulb · Spec"
          badge="AP-05"
          preview="Every car with WY21W front turn signals inherits this bulb."
        >
          <div className="mt-space-md flex flex-col gap-space-sm">
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Bulb type</span>
              <input className="w-full bg-surface-container-low text-on-surface font-mono-md text-mono-md rounded-lg px-3 py-1.5 outline-none focus:bg-surface-container-lowest uppercase" defaultValue="WY21W" readOnly />
            </div>
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Mounting housing</span>
              <PositionChips scheme="front_rear_side" position={draft.position || "front"} side={draft.side} onPick={(p, s) => setDraft({ ...draft, position: p, side: s })} />
            </div>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="lighting"
          categoryLine="Lighting · By size or spec"
          title="Brake &amp; tail bulb"
          badge="AP-06"
          preview="Fits standard dual-contact tail assemblies across 19 models."
        >
          <div className="mt-space-md flex flex-col gap-space-sm">
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Bulb type</span>
              <input className="w-full bg-surface-container-low text-on-surface font-mono-md text-mono-md rounded-lg px-3 py-1.5 outline-none uppercase" defaultValue="W21/5W" readOnly />
              <span className="font-mono-sm text-mono-sm text-on-surface-variant block mt-1">Dual-filament 21W/5W specification</span>
            </div>
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Position tag</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container font-mono-sm text-mono-sm text-on-surface">
                <MaterialIcon name="pin_drop" className="text-[15px] text-primary" />
                Rear brake &amp; park lamp
              </div>
            </div>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="lighting"
          categoryLine="Lighting · By size or spec"
          title="Fog light bulb"
          badge="AP-07"
          preview="Matches low-heat polymer fog housings across Toyota &amp; Daihatsu."
        >
          <div className="mt-space-md flex flex-col gap-space-sm">
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Bulb type</span>
              <input className="w-full bg-surface-container-low text-on-surface font-mono-md text-mono-md rounded-lg px-3 py-1.5 outline-none uppercase" defaultValue="H16" readOnly />
              <span className="font-mono-sm text-mono-sm text-on-surface-variant block mt-1">19W halogen base PGJ19-3</span>
            </div>
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Beam chip assignment</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-fixed text-on-primary-fixed font-mono-sm text-mono-sm font-semibold">
                <MaterialIcon name="foggy" className="text-[15px]" />
                Front fog lamp
              </div>
            </div>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="fluids"
          categoryLine="Fluids · By size or spec"
          title="Brake fluid"
          badge="AP-08"
          preview="DOT 4 high-temp fluid valid across entire fleet hydraulic brakes."
        >
          <div className="mt-space-md">
            <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Grade</span>
            <div className="relative">
              <select className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg px-3 py-1.5 outline-none appearance-none cursor-pointer" defaultValue="DOT 4">
                <option>DOT 3</option>
                <option>DOT 4</option>
                <option>DOT 5.1</option>
              </select>
              <MaterialIcon name="expand_more" className="absolute right-2.5 top-2 text-[18px] text-outline pointer-events-none" />
            </div>
          </div>
          <div className="mt-space-sm flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-on-surface-variant">Dry ERBP &gt; 230°C</span>
            <span className="px-2 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-on-surface-variant">Glycol-ether</span>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="fluids"
          categoryLine="Fluids · By size or spec"
          title="Engine coolant"
          badge="AP-09"
          preview="Applied automatically to all Toyota/Daihatsu aluminum engines."
        >
          <div className="mt-space-md flex flex-col gap-space-sm">
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Coolant type</span>
              <input className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg px-3 py-1.5 outline-none" defaultValue="Toyota Super Long Life Coolant" readOnly />
            </div>
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Optional color chip</span>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-100 text-pink-900 font-mono-sm text-mono-sm font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                Pink (50/50 pre-diluted)
              </div>
            </div>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="fluids"
          categoryLine="Fluids · By size or spec"
          title="Washer fluid"
          badge="AP-10"
          preview="Universal fleet consumable: zero chassis restrictions."
        >
          <div className="mt-space-md flex flex-col gap-space-sm">
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Type</span>
              <div className="relative">
                <select className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg px-3 py-1.5 outline-none appearance-none cursor-pointer" defaultValue="Ready-mixed">
                  <option>Ready-mixed</option>
                  <option>Concentrate</option>
                </select>
                <MaterialIcon name="expand_more" className="absolute right-2.5 top-2 text-[18px] text-outline pointer-events-none" />
              </div>
            </div>
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Freeze rating chip</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container font-mono-sm text-mono-sm text-on-surface">
                <MaterialIcon name="ac_unit" className="text-[15px] text-primary" />
                -25°C All-season
              </div>
            </div>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="fluids"
          categoryLine="Transmission · By size or spec"
          title="Transmission fluid"
          badge="AP-11"
          preview="Matches CVT-equipped KSP130 and M900A transaxles."
        >
          <div className="mt-space-md flex flex-col gap-space-sm">
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Fluid name / code</span>
              <input className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg px-3 py-1.5 outline-none" defaultValue="CVT Fluid FE" readOnly />
            </div>
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Gearbox architecture</span>
              <div className="flex gap-1.5">
                <button type="button" className="flex-1 py-1 px-2 rounded-lg bg-primary-container text-on-primary font-mono-sm text-mono-sm font-semibold">CVT</button>
                <button type="button" className="flex-1 py-1 px-2 rounded-lg bg-surface-container text-on-surface font-mono-sm text-mono-sm">Automatic</button>
                <button type="button" className="flex-1 py-1 px-2 rounded-lg bg-surface-container text-on-surface font-mono-sm text-mono-sm">Manual</button>
              </div>
            </div>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="engine_belts"
          categoryLine="Engine · By engine"
          title="Spark plugs · Count"
          badge="AP-12"
          preview="1KR-FE 3-cylinder engine requires pack of 3 plugs."
        >
          <div className="mt-space-md">
            <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">How many per engine?</span>
            <div className="flex items-center gap-2">
              <input className="w-20 bg-surface-container-low text-on-surface font-mono-md text-mono-md rounded-lg px-3 py-1.5 outline-none text-center font-bold" type="number" defaultValue={3} readOnly />
              <span className="font-mono-sm text-mono-sm text-on-surface-variant">plugs per complete set</span>
            </div>
          </div>
          <div className="mt-space-sm flex items-start gap-1.5">
            <MaterialIcon name="info" className="text-[15px] text-outline mt-0.5" />
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug">Sold per plug; most cars need one per cylinder.</p>
          </div>
        </CardShell>

        <CardShell
          filter={filter}
          category="engine_belts"
          categoryLine="Belts &amp; hoses · By engine"
          title="Drive belt · Serpentine"
          badge="AP-13"
          preview="4-rib 875mm belt matches water pump &amp; alternator on 1KR-FE."
        >
          <div className="mt-space-md flex flex-col gap-space-sm">
            <div>
              <span className="block font-label-xs text-label-xs uppercase tracking-wider text-outline mb-1 font-bold">Belt size (Ribbed profile)</span>
              <input className="w-full bg-surface-container-low text-on-surface font-mono-md text-mono-md rounded-lg px-3 py-1.5 outline-none uppercase" defaultValue="4PK875" readOnly />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-on-surface-variant">4 Ribs</span>
              <span className="px-2 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-on-surface-variant">875mm effective length</span>
            </div>
          </div>
        </CardShell>
      </div>

      <div className="mt-space-xl p-space-lg bg-surface-container-lowest rounded-xl flex flex-col sm:flex-row items-center justify-between gap-space-md shadow-sm">
        <div className="flex items-center gap-space-md">
          <MaterialIcon name="verified" className="text-[24px] text-primary" />
          <div>
            <span className="font-headline-md text-headline-md text-on-surface block">Taxonomy Schema Check Complete</span>
            <span className="font-mono-sm text-mono-sm text-on-surface-variant">All 13 modular position &amp; spec definitions mapped to Enterprise OS v4.8</span>
          </div>
        </div>
        <div className="flex items-center gap-space-sm flex-wrap">
          <button
            type="button"
            className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors"
            onClick={onExportSpecs}
          >
            Export Specs JSON
          </button>
          <button
            type="button"
            className="px-space-md py-1.5 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md transition-colors shadow-sm disabled:opacity-50"
            disabled={committing}
            onClick={() => { void onCommitTemplates(); }}
          >
            Commit Catalog Templates
          </button>
        </div>
      </div>
    </div>
  );
}
