/**
 * "What powers this car" — Stitch powertrain-job-fit-dominion screens 1–4 (worked out / editing /
 * confirmed / re-confirm), content from docs/powertrain-job-fit-audit.md section 4 and 3b.
 * Drop (audit 9): confidence %, VIN / engine codes, "Algorithmic configuration" banner, telemetry.
 */
import { useState } from "react";
import { toast } from "sonner";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { confirmPowertrain } from "../../../../services/vehicleCatalogService";
import { PartsButton } from "../../parts-database/PartsButton";
import { D_CARD, D_MUTED, D_TXT, DIcon, DPill } from "../../parts-database/add-parts/catalog/dominionKit";
import {
  FUELS,
  FUEL_LABEL,
  POWERTRAINS,
  POWERTRAIN_ICON,
  POWERTRAIN_LABEL,
  fuelName,
  powertrainName,
  workedOutFrom,
  type Powertrain,
} from "../../powertrain/powertrainModel";

type Props = {
  car: VehicleCatalogRecord;
  token: string;
  canWrite: boolean;
  onSaved: (patch: Partial<VehicleCatalogRecord> & { id: string }) => void;
};

const SELECT =
  "h-10 w-full cursor-pointer appearance-none rounded-xl bg-[#f3f4fb] pl-3.5 pr-9 text-[15px] text-[#30323b] focus:outline-none focus:ring-2 focus:ring-[#0153dc]/30 dark:bg-[#0b1220] dark:text-[#e2e8f0]";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function PowertrainCard({ car, token, canWrite, onSaved }: Props) {
  const status = car.powertrain_status ?? null;
  const reconfirm = status === "needs_check" && Boolean(car.powertrain_note);
  const unplaced = status === "needs_check" && !reconfirm;
  const [editing, setEditing] = useState(false);
  const [pt, setPt] = useState(car.powertrain ?? "");
  const [fu, setFu] = useState(car.fuel ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const showSelects = editing || (unplaced && canWrite);

  const save = async (powertrain: string, fuel: string) => {
    if (!powertrain || !fuel) return;
    setBusy(true);
    setFailed(false);
    try {
      const item = await confirmPowertrain(token, car.id, powertrain, fuel);
      onSaved(item);
      setEditing(false);
      toast.success(`${car.make} ${car.model}: ${powertrainName(powertrain)} · ${fuelName(fuel)} confirmed`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setPt(car.powertrain ?? "");
    setFu(car.fuel ?? "");
    setFailed(false);
    setEditing(true);
  };

  const chip =
    status === "confirmed" ? (
      <DPill tone="green" icon="verified">Confirmed</DPill>
    ) : status === "derived" ? (
      <DPill tone="blue" icon="auto_awesome">Worked out</DPill>
    ) : (
      <DPill tone="amber" icon="help">Needs checking</DPill>
    );

  const sub =
    status === "confirmed"
      ? `Confirmed${car.powertrain_last_confirmed_at ? ` on ${fmtDate(car.powertrain_last_confirmed_at)}` : ""}`
      : status === "derived"
        ? workedOutFrom(car.fuel_type, car.engine_type)
        : reconfirm
          ? `Last confirmed${car.powertrain_last_confirmed_at ? ` on ${fmtDate(car.powertrain_last_confirmed_at)}` : ""}`
          : "Roam couldn't work this one out. Pick what powers it.";

  return (
    <section className={`${D_CARD} p-6`} data-testid="powertrain-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/40 dark:text-[#93b4ff]">
            <DIcon name="electric_car" className="text-[22px]" />
          </span>
          <div>
            <h2 className={`text-[18px] font-semibold ${D_TXT}`}>What powers this car</h2>
            <p className={`text-[13px] ${D_MUTED}`}>Decides which maintenance jobs this car is offered.</p>
          </div>
        </div>
        {chip}
      </div>

      {reconfirm ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-[#fff4dc] px-4 py-3 text-[14px] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]">
          <DIcon name="warning" className="mt-0.5 text-[18px]" />
          <span>{car.powertrain_note}</span>
        </div>
      ) : null}

      {showSelects ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <span className={`mb-1.5 block text-[13px] font-medium ${D_MUTED}`}>Powertrain</span>
            <span className="relative block">
              <select className={SELECT} value={pt} disabled={busy} onChange={(e) => setPt(e.target.value)} aria-label="Powertrain">
                <option value="">Choose…</option>
                {POWERTRAINS.map((c) => (
                  <option key={c} value={c}>
                    {POWERTRAIN_LABEL[c]}
                  </option>
                ))}
              </select>
              <DIcon name="expand_more" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[20px] text-[#5d5f68]" />
            </span>
          </label>
          <label className="block">
            <span className={`mb-1.5 block text-[13px] font-medium ${D_MUTED}`}>Fuel</span>
            <span className="relative block">
              <select className={SELECT} value={fu} disabled={busy} onChange={(e) => setFu(e.target.value)} aria-label="Fuel">
                <option value="">Choose…</option>
                {FUELS.map((c) => (
                  <option key={c} value={c}>
                    {FUEL_LABEL[c]}
                  </option>
                ))}
              </select>
              <DIcon name="expand_more" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[20px] text-[#5d5f68]" />
            </span>
          </label>
        </div>
      ) : (
        <div className="divide-y divide-[#e6e7ee] dark:divide-[#1e293b]">
          <Row label="Powertrain" icon={car.powertrain ? POWERTRAIN_ICON[car.powertrain as Powertrain] : "help"} value={powertrainName(car.powertrain)} />
          <Row label="Fuel" icon="local_gas_station" value={fuelName(car.fuel)} />
        </div>
      )}

      <p className={`mt-3 flex items-center gap-1.5 text-[13px] ${D_MUTED}`}>
        <DIcon name={status === "confirmed" ? "verified" : "auto_awesome"} className="text-[16px]" />
        {sub}
      </p>

      {failed ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c9c8] bg-[#fdecec] px-4 py-3 dark:border-[#7f1d1d] dark:bg-[#450a0a]">
          <span className="flex items-center gap-2 text-[14px] font-medium text-[#a83836] dark:text-[#f87171]">
            <DIcon name="error" className="text-[18px]" /> Couldn&apos;t save this. Try again.
          </span>
          <PartsButton variant="danger" disabled={busy} onClick={() => void save(pt || car.powertrain || "", fu || car.fuel || "")}>
            Try again
          </PartsButton>
        </div>
      ) : null}

      {canWrite ? (
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {showSelects ? (
            <>
              {editing ? (
                <PartsButton variant="danger" disabled={busy} onClick={() => setEditing(false)}>
                  Cancel
                </PartsButton>
              ) : null}
              <PartsButton variant="primary" disabled={busy || !pt || !fu} onClick={() => void save(pt, fu)}>
                <DIcon name="check" className="text-[18px]" /> {busy ? "Saving…" : editing ? "Save" : "Confirm"}
              </PartsButton>
            </>
          ) : (
            <>
              <PartsButton variant="secondary" disabled={busy} onClick={startEdit}>
                <DIcon name="edit" className="text-[18px]" /> Edit
              </PartsButton>
              {status !== "confirmed" && car.powertrain && car.fuel ? (
                <PartsButton variant="primary" disabled={busy} onClick={() => void save(car.powertrain!, car.fuel!)}>
                  <DIcon name="check_circle" className="text-[18px]" /> {busy ? "Saving…" : reconfirm ? "Re-confirm" : "Confirm"}
                </PartsButton>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, icon, value }: { label: string; icon: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className={`text-[15px] ${D_TXT}`}>{label}</span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dbe1ff] px-3 py-1 text-[14px] font-medium text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
        <DIcon name={icon} className="text-[16px]" />
        {value}
      </span>
    </div>
  );
}
