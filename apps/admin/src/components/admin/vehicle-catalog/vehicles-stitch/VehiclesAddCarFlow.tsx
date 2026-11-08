import { useMemo, useState } from "react";
import { versionDifferenceLabel, versionYearsLabel } from "@roam/vehicle-catalog-core";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { PartsButton } from "../../parts-database/PartsButton";
import { MakerLogo } from "../MakerLogo";
import type { CatalogMakerSummary } from "../vehiclesCatalogApi";
import { duplicateLine, duplicateOfExisting, saveToCarsLabel } from "./vehiclesStitchShared";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DIcon, DQuestion, DStepper } from "../../parts-database/add-parts/catalog/dominionKit";

const STEPS = ["Maker", "Model", "Years", "Difference", "Codes", "Review"] as const;
type Step = 1 | 2 | 3 | 4 | 5 | 6;

type Draft = {
  make: string;
  model: string;
  production_start_year: string;
  production_end_year: string;
  drivetrain: string;
  engine_displacement_l: string;
  fuel_type: string;
  transmission: string;
  facelift: boolean;
  chassis_code: string;
  engine_code: string;
};

const emptyDraft = (): Draft => ({
  make: "",
  model: "",
  production_start_year: "2016",
  production_end_year: "2020",
  drivetrain: "2WD",
  engine_displacement_l: "1.0",
  fuel_type: "Petrol",
  transmission: "CVT",
  facelift: false,
  chassis_code: "M900A",
  engine_code: "1KR-FE",
});

type Props = {
  makers: CatalogMakerSummary[];
  items: VehicleCatalogRecord[];
  logoByMake: Map<string, string | null | undefined>;
  sisters: Array<{ id: string; make: string; model: string }>;
  onBack: () => void;
  onOpenCar: (r: VehicleCatalogRecord) => void;
  onSubmit: (draft: Draft) => Promise<void>;
  presetMake?: string;
  presetModel?: string;
  /** Dominion vehicles capture: open Review with the Roomy duplicate draft. */
  addCarReviewCapture?: boolean;
};

export function VehiclesAddCarFlow({
  makers,
  items,
  logoByMake,
  sisters,
  onBack,
  onOpenCar,
  onSubmit,
  presetMake,
  presetModel,
  addCarReviewCapture = false,
}: Props) {
  const [step, setStep] = useState<Step>(
    addCarReviewCapture ? 6 : presetMake ? (presetModel ? 3 : 2) : 1,
  );
  const [draft, setDraft] = useState<Draft>(() => {
    if (addCarReviewCapture) {
      return {
        ...emptyDraft(),
        make: "Toyota",
        model: "Roomy",
        production_start_year: "2016",
        production_end_year: "2020",
        drivetrain: "2WD",
        engine_code: "1KR-FE",
        chassis_code: "M900A",
      };
    }
    return {
      ...emptyDraft(),
      make: presetMake?.trim() ?? "",
      model: presetModel?.trim() ?? "",
    };
  });
  const [saving, setSaving] = useState(false);
  const [makerQ, setMakerQ] = useState("");

  const duplicate = useMemo(() => {
    if (step !== 6) return null;
    const candidate = {
      make: draft.make,
      model: draft.model,
      production_start_year: Number(draft.production_start_year),
      production_end_year: draft.production_end_year ? Number(draft.production_end_year) : null,
      drivetrain: draft.drivetrain,
      engine_code: draft.engine_code,
      chassis_code: draft.chassis_code,
    } as VehicleCatalogRecord;
    return duplicateOfExisting(items, candidate);
  }, [draft, items, step]);

  const reviewDiff = useMemo(() => {
    const pseudo = {
      id: "draft",
      make: draft.make,
      model: draft.model,
      production_start_year: Number(draft.production_start_year) || 0,
      production_end_year: draft.production_end_year ? Number(draft.production_end_year) : null,
      drivetrain: draft.drivetrain,
      engine_code: draft.engine_code,
      engine_displacement_l: Number(draft.engine_displacement_l) || null,
      fuel_type: draft.fuel_type,
      chassis_code: draft.chassis_code,
      vehicle_class: "car",
      created_at: "",
      updated_at: "",
    } as unknown as VehicleCatalogRecord;
    return versionDifferenceLabel(pseudo);
  }, [draft]);

  const filteredMakers = makers.filter((m) => m.make.toLowerCase().includes(makerQ.toLowerCase()));

  async function finish() {
    setSaving(true);
    try {
      await onSubmit(draft);
    } finally {
      setSaving(false);
    }
  }


  const field =
    "h-11 rounded-lg border border-[#e6e7ee] bg-[#f3f4fb] px-3 text-[15px] dark:border-[#1e293b] dark:bg-[#0b1220]";
  const next = (to: Step, label = "Next", disabled = false) => (
    <PartsButton variant="primary" className="self-start" disabled={disabled} onClick={() => setStep(to)}>
      {label} <DIcon name="arrow_forward" className="text-[18px]" />
    </PartsButton>
  );

  return (
    <div className="vehicles-database-stitch parts-database-stitch flex max-w-[1000px] flex-col gap-5 px-margin py-space-lg">
      <PartsButton variant="secondary" className="self-start" onClick={onBack}>
        <DIcon name="arrow_back" className="text-[18px]" /> Back to Vehicles
      </PartsButton>
      <div>
        <h1 className={`text-[26px] font-semibold tracking-tight ${D_TXT}`}>Add a car</h1>
        <p className={`text-[15px] ${D_MUTED}`}>One question at a time. We check for a duplicate before you add it.</p>
      </div>
      <DStepper steps={[...STEPS]} current={step} onJump={(n) => setStep(n as Step)} />

      <div className={`${D_CARD} p-6 sm:p-8`}>
        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <DQuestion title="Which maker?" hint="Pick the maker, or search for it." />
            <div className="relative max-w-md">
              <DIcon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-[#5d5f68]" />
              <input className={`${field} w-full pl-10`} placeholder="Search makers" value={makerQ} onChange={(e) => setMakerQ(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {filteredMakers.slice(0, 24).map((m) => {
                const on = draft.make === m.make;
                return (
                  <button
                    key={m.make}
                    type="button"
                    className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
                      on ? "border-[#0153dc] bg-[#dbe1ff] dark:bg-[#1e3a8a]/40" : "border-[#e6e7ee] bg-white hover:border-[#0153dc] dark:border-[#1e293b] dark:bg-[#111a2e]"
                    }`}
                    onClick={() => {
                      setDraft((d) => ({ ...d, make: m.make }));
                      setStep(2);
                    }}
                  >
                    <MakerLogo make={m.make} logoStoragePath={m.logo_storage_path} size={40} />
                    <span className={`text-[14px] font-medium ${D_TXT}`}>{m.make}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <DQuestion title={`Which ${draft.make || "car"} model?`} hint="Type the model name as the maker writes it." />
            <input className={`${field} max-w-md`} value={draft.model} onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))} placeholder="e.g. Roomy" />
            {next(3, "Next", !draft.model.trim())}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <DQuestion title="Which years?" hint="Leave the end year empty if it is still made." />
            <div className="flex items-center gap-2">
              <input className={`${field} w-28`} aria-label="From year" value={draft.production_start_year} onChange={(e) => setDraft((d) => ({ ...d, production_start_year: e.target.value }))} />
              <span className={D_MUTED}>–</span>
              <input className={`${field} w-28`} aria-label="To year" placeholder="today" value={draft.production_end_year} onChange={(e) => setDraft((d) => ({ ...d, production_end_year: e.target.value }))} />
            </div>
            {next(4)}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-col gap-4">
            <DQuestion title="How is this version different?" hint="Only fill in what tells it apart from the other versions." />
            <div className="flex flex-wrap gap-2">
              {["2WD", "4WD"].map((d) => (
                <PartsButton key={d} variant={draft.drivetrain === d ? "primary" : "secondary"} onClick={() => setDraft((x) => ({ ...x, drivetrain: d }))}>
                  {d}
                </PartsButton>
              ))}
            </div>
            <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
              <input className={field} placeholder="Engine size (L), e.g. 1.0" value={draft.engine_displacement_l} onChange={(e) => setDraft((d) => ({ ...d, engine_displacement_l: e.target.value }))} />
              <input className={field} placeholder="Fuel, e.g. Petrol" value={draft.fuel_type} onChange={(e) => setDraft((d) => ({ ...d, fuel_type: e.target.value }))} />
              <input className={field} placeholder="Gearbox, e.g. CVT" value={draft.transmission} onChange={(e) => setDraft((d) => ({ ...d, transmission: e.target.value }))} />
            </div>
            <label className={`flex items-center gap-2 text-[14px] ${D_TXT}`}>
              <input type="checkbox" className="h-4 w-4 accent-[#0153dc]" checked={draft.facelift} onChange={(e) => setDraft((d) => ({ ...d, facelift: e.target.checked }))} />
              After the update
            </label>
            {next(5)}
          </div>
        ) : null}

        {step === 5 ? (
          <div className="flex flex-col gap-4">
            <DQuestion title="Frame and engine codes" hint="From the car's ID plate. Optional." />
            <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              <input className={`${field} ${D_MONO}`} placeholder="Frame code, e.g. M900A" value={draft.chassis_code} onChange={(e) => setDraft((d) => ({ ...d, chassis_code: e.target.value }))} />
              <input className={`${field} ${D_MONO}`} placeholder="Engine code, e.g. 1KR-FE" value={draft.engine_code} onChange={(e) => setDraft((d) => ({ ...d, engine_code: e.target.value }))} />
            </div>
            {next(6, "Next: review")}
          </div>
        ) : null}

        {step === 6 ? (
          <div className="flex flex-col gap-5">
            <DQuestion title={`Review: ${draft.make} ${draft.model}`} hint="Check it, then add the car." />
            {duplicate ? (
              <div className="flex flex-col justify-between gap-3 rounded-xl border border-[#f5d28a] bg-[#fff4dc] p-4 dark:border-[#78350f] dark:bg-[#451a03] sm:flex-row sm:items-center">
                <p className="flex items-start gap-2 text-[15px] text-[#8a5a00] dark:text-[#fbbf24]">
                  <DIcon name="warning" className="text-[20px]" /> {duplicateLine(duplicate)}
                </p>
                <PartsButton variant="secondary" className="shrink-0" onClick={() => onOpenCar(duplicate)}>
                  Open existing car
                </PartsButton>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[
                { title: "Years", body: versionYearsLabel(Number(draft.production_start_year), Number(draft.production_end_year) || null), edit: 3, icon: "calendar_month" },
                { title: "Drive and gearbox", body: [reviewDiff, draft.transmission].filter(Boolean).join(" · "), edit: 4, icon: "settings" },
                { title: "Engine and fuel", body: [draft.engine_code, draft.fuel_type].filter(Boolean).join(" · ") || "Not on file", edit: 5, icon: "local_gas_station" },
                { title: "Frame and engine codes", body: [draft.chassis_code, draft.engine_code].filter(Boolean).join(" · ") || "Not on file", edit: 5, icon: "qr_code_2" },
              ].map((card) => (
                <div key={card.title} className="flex items-start justify-between gap-3 rounded-xl bg-[#f3f4fb] p-4 dark:bg-[#0b1220]">
                  <div className="flex items-start gap-3">
                    <DIcon name={card.icon} className="mt-0.5 text-[20px] text-[#5d5f68]" />
                    <div>
                      <p className={`text-[13px] ${D_MUTED}`}>{card.title}</p>
                      <p className={`text-[16px] font-medium ${D_TXT}`}>{card.body}</p>
                    </div>
                  </div>
                  <PartsButton variant="secondary" className="!h-8 !px-2.5 text-[12px]" onClick={() => setStep(card.edit as Step)}>
                    Edit
                  </PartsButton>
                </div>
              ))}
            </div>
            {sisters.length > 0 ? (
              <div className="rounded-xl border border-[#e6e7ee] p-4 dark:border-[#1e293b]">
                <p className={`mb-2 text-[14px] font-semibold ${D_TXT}`}>Sister cars</p>
                <ul className="flex flex-wrap gap-2">
                  {sisters.map((s) => (
                    <li key={s.id} className={`inline-flex items-center gap-1.5 rounded-full border border-[#e6e7ee] bg-[#f3f4fb] px-2.5 py-1 text-[13px] dark:border-[#1e293b] dark:bg-[#0b1220] ${D_TXT}`}>
                      <MakerLogo make={s.make} logoStoragePath={logoByMake.get(s.make.toLowerCase())} size={20} />
                      {s.make} {s.model}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e7ee] pt-6 dark:border-[#1e293b]">
          {step > 1 ? (
            <PartsButton variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)}>
              <DIcon name="arrow_back" className="text-[18px]" /> Back
            </PartsButton>
          ) : (
            <PartsButton variant="danger" onClick={onBack}>Cancel</PartsButton>
          )}
          {step === 6 ? (
            <PartsButton variant="primary" disabled={saving} onClick={() => void finish()}>
              <DIcon name="add" className="text-[18px]" /> Add car
            </PartsButton>
          ) : null}
        </div>
      </div>
      {step < 6 ? <p className="sr-only">{saveToCarsLabel(0)}</p> : null}
    </div>
  );
}
