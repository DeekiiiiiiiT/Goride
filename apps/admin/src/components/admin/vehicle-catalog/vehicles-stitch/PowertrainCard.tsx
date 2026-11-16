/**
 * "What powers this car" — ported exactly from Stitch docs/stitch/powertrain-job-fit-dominion/html/
 * 01 (worked out), 02 (editing), 03 (confirmed), 04 (re-confirm). Content: docs/powertrain-job-fit-audit.md
 * sections 3b and 4. Dropped (audit 9): confidence score, VIN / engine codes, spec strips, invented
 * banner text, "Engine system pairing", "Fits 142 jobs" line, side panels.
 */
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { confirmPowertrain } from "../../../../services/vehicleCatalogService";
import {
  FUELS,
  FUEL_LABEL,
  POWERTRAINS,
  POWERTRAIN_LABEL,
  POWERTRAIN_SHORT,
  fuelName,
  powertrainName,
} from "../../powertrain/powertrainModel";
import {
  BTN_CANCEL,
  BTN_GREY,
  BTN_PRIMARY,
  BTN_WHITE,
  DIcon,
  FUEL_ICON,
  PT_HINT,
  PT_ICON,
  PT_MEANS,
  PT_TILE,
  S,
  SChip,
  SaveFailed,
  T,
} from "../../powertrain/ptStitch";

type Props = {
  car: VehicleCatalogRecord;
  token: string;
  canWrite: boolean;
  onSaved: (patch: Partial<VehicleCatalogRecord> & { id: string }) => void;
};

export function fmtPtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The raw text the rule read, e.g. "Hybrid(petrol) / Hybrid". */
function rawText(car: VehicleCatalogRecord): string {
  return [car.fuel_type, car.engine_type]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" / ");
}

export type CardMode = "derived" | "editing" | "pick" | "confirmed" | "reconfirm";

export function cardMode(car: Pick<VehicleCatalogRecord, "powertrain_status" | "powertrain_note">, editing: boolean): CardMode {
  if (editing) return "editing";
  const status = car.powertrain_status ?? null;
  if (status === "confirmed") return "confirmed";
  if (status === "derived") return "derived";
  return car.powertrain_note ? "reconfirm" : "pick";
}

export function PowertrainCard({ car, token, canWrite, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [pt, setPt] = useState(car.powertrain ?? "");
  const [fu, setFu] = useState(car.fuel ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<null | [string, string]>(null);

  const mode = cardMode(car, editing);
  const showForm = mode === "editing" || (mode === "pick" && canWrite);

  const save = async (powertrain: string, fuel: string) => {
    if (!powertrain || !fuel) return;
    setBusy(true);
    setFailed(null);
    try {
      const item = await confirmPowertrain(token, car.id, powertrain, fuel);
      onSaved(item);
      setEditing(false);
      toast.success(`${car.make} ${car.model}: ${powertrainName(powertrain)} · ${fuelName(fuel)} confirmed`);
    } catch {
      setFailed([powertrain, fuel]);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setPt(car.powertrain ?? "");
    setFu(car.fuel ?? "");
    setFailed(null);
    setEditing(true);
  };

  const confirmedOn = fmtPtDate(car.powertrain_last_confirmed_at);
  const glow = (
    <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-[#dbe1ff]/30 to-transparent blur-2xl dark:from-[#1e3a8a]/20" />
  );

  const header = (
    <div className="relative z-10 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2">
        <div
          className={`flex shrink-0 items-center justify-center rounded-lg ${S.primary} ${
            mode === "derived" ? `h-8 w-8 ${S.mid}` : mode === "confirmed" ? `h-9 w-9 ${S.low}` : mode === "reconfirm" ? `h-9 w-9 ${S.high}` : `h-9 w-9 ${S.primaryFixed}`
          }`}
        >
          <DIcon name={mode === "confirmed" ? "electric_car" : "electric_meter"} className="text-[20px]" />
        </div>
        <div>
          <h2 className={`${mode === "reconfirm" ? T.headlineLg : T.headlineSm} ${S.text}`}>What powers this car</h2>
          {mode !== "derived" ? (
            <p className={`${T.bodySm} ${S.muted}`}>Decides which maintenance jobs this car is offered.</p>
          ) : null}
        </div>
      </div>
      {mode === "confirmed" ? (
        <SChip tone="green" icon="check_circle" filled testId="pt-status">Confirmed</SChip>
      ) : mode === "derived" ? (
        <SChip tone="grey" icon="auto_awesome" testId="pt-status">Worked out</SChip>
      ) : mode === "editing" ? (
        <SChip tone="blue" dot testId="pt-status">Editing</SChip>
      ) : (
        <SChip tone="amber" icon="help_outline" testId="pt-status">Needs checking</SChip>
      )}
    </div>
  );

  /* ---------- 02 Editing (also a needs_check model with nothing placed yet) ---------- */
  if (showForm) {
    return (
      <section className={`${S.card} relative p-7`} data-testid="powertrain-card" data-mode={mode}>
        <div className="mb-6 pb-4">{header}</div>
        <div className={`mb-6 flex items-start gap-2 rounded-xl p-4 bg-[#d9e2fe]/40 dark:bg-[#1e3a8a]/30`}>
          <DIcon name="info" className="mt-0.5 text-[20px] text-[#0153dc] dark:text-[#93b4ff]" />
          <div className="flex flex-col">
            <span className={`${T.labelMd} font-semibold ${S.primary}`}>
              {mode === "pick" ? "Roam couldn't work this one out" : "This changes which jobs this car is offered"}
            </span>
            <span className={`${T.bodySm} text-[#5b647c] dark:text-[#c7d2fe]`}>
              {mode === "pick"
                ? "Pick what powers it. Until then, fleets with this car see every job."
                : "Fleets with this car will see the jobs that fit what you pick here."}
            </span>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <PickField
            label="Powertrain"
            value={pt}
            current={car.powertrain ?? null}
            disabled={busy}
            onChange={setPt}
            options={POWERTRAINS.map((c) => ({
              code: c,
              name: POWERTRAIN_LABEL[c],
              short: POWERTRAIN_SHORT[c],
              hint: PT_HINT[c],
              icon: PT_ICON[c],
              tile: PT_TILE[c],
              pill: c.toUpperCase(),
            }))}
            triggerAsChip
            help={pt ? (
              <>
                <strong className={`font-medium ${S.text}`}>{POWERTRAIN_SHORT[pt as keyof typeof POWERTRAIN_SHORT]}</strong> = {PT_MEANS[pt]}
              </>
            ) : (
              "Pick what drives the wheels."
            )}
            helpIcon="help_outline"
            listTitle="Pick one"
            testId="pt-pick-powertrain"
          />
          <PickField
            label="Fuel"
            value={fu}
            current={car.fuel ?? null}
            disabled={busy}
            onChange={setFu}
            options={FUELS.map((c) => ({ code: c, name: FUEL_LABEL[c], icon: FUEL_ICON[c], tile: `${S.mid} ${S.secondary}` }))}
            help="What goes in the tank. Pick Electric for a battery-only car."
            helpIcon="info"
            listTitle="Pick one"
            testId="pt-pick-fuel"
          />
        </div>

        {failed ? (
          <div className="mb-4">
            <SaveFailed busy={busy} onRetry={() => void save(failed[0], failed[1])} />
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 pt-4">
          <div className={`flex items-center gap-2 ${T.bodySm} ${S.outline}`}>
            {confirmedOn ? (
              <>
                <DIcon name="history" className="text-[16px]" />
                <span>Last confirmed on {confirmedOn}</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            {mode === "editing" ? (
              <button type="button" className={BTN_CANCEL} disabled={busy} onClick={() => setEditing(false)}>
                <DIcon name="close" className="text-[18px]" /> Cancel
              </button>
            ) : null}
            <button type="button" className={BTN_PRIMARY} disabled={busy || !pt || !fu} onClick={() => void save(pt, fu)}>
              <DIcon name="check" className="text-[18px]" /> {busy ? "Saving…" : "Save and confirm"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const ptName = powertrainName(car.powertrain);
  const fuName = fuelName(car.fuel);
  const ptIcon = PT_ICON[car.powertrain ?? ""] ?? "help";
  const fuIcon = FUEL_ICON[car.fuel ?? ""] ?? "local_gas_station";
  const raw = rawText(car);
  const failedStrip = failed ? (
    <div className="mt-4">
      <SaveFailed busy={busy} onRetry={() => void save(failed[0], failed[1])} />
    </div>
  ) : null;

  /* ---------- 03 Confirmed ---------- */
  if (mode === "confirmed") {
    return (
      <section className={`${S.card} relative overflow-hidden p-7 shadow-md`} data-testid="powertrain-card" data-mode={mode}>
        {glow}
        <div className="pb-6">{header}</div>
        <div className={`relative mb-6 grid grid-cols-1 gap-6 rounded-xl px-6 py-6 md:grid-cols-2 ${S.low}`}>
          <div className="flex flex-col gap-2">
            <span className={`${T.labelSm} uppercase tracking-wider ${S.secondary}`}>Powertrain</span>
            <div className="flex flex-wrap items-center gap-4">
              <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 shadow-sm ${T.labelLg} ${S.secContainer}`}>
                <DIcon name={ptIcon} className="text-[18px]" />
                <span className="font-semibold">{ptName}</span>
              </span>
              {car.engine_type ? <span className={`${T.bodySm} ${S.muted} ${S.mono}`}>{car.engine_type}</span> : null}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={`${T.labelSm} uppercase tracking-wider ${S.secondary}`}>Fuel</span>
            <div className="flex flex-wrap items-center gap-4">
              <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 shadow-sm ${T.labelLg} ${S.highest} ${S.muted}`}>
                <DIcon name={fuIcon} className="text-[18px]" />
                <span className="font-semibold">{fuName}</span>
              </span>
              {car.fuel_type ? <span className={`${T.bodySm} ${S.muted} ${S.mono}`}>{car.fuel_type}</span> : null}
            </div>
          </div>
        </div>
        <div className="relative flex flex-col justify-between gap-4 rounded-xl bg-[#dbe1ff]/30 px-6 py-4 dark:bg-[#1e3a8a]/20 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${S.greenChip}`}>
              <DIcon name="verified_user" className="text-[18px]" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${T.labelMd} font-semibold ${S.text}`}>Checked and confirmed</span>
              {confirmedOn ? (
                <>
                  <span className={`${T.bodySm} ${S.muted}`}>·</span>
                  <span className={`${T.bodySm} ${S.muted}`}>
                    on <strong className={`font-semibold ${S.text}`}>{confirmedOn}</strong>
                  </span>
                </>
              ) : null}
            </div>
          </div>
          {canWrite ? (
            <button type="button" className={`${BTN_WHITE} self-end lg:self-auto`} disabled={busy} onClick={startEdit}>
              <DIcon name="edit" className={`text-[18px] ${S.secondary}`} /> Edit
            </button>
          ) : null}
        </div>
        {failedStrip}
      </section>
    );
  }

  /* ---------- 04 Re-confirm (text changed after confirmation) ---------- */
  if (mode === "reconfirm") {
    const canConfirm = Boolean(car.powertrain && car.fuel);
    return (
      <section className={`${S.card} p-7`} data-testid="powertrain-card" data-mode={mode}>
        <div className="pb-4">{header}</div>
        <div className={`mt-2 flex items-start gap-3.5 rounded-xl p-4 ${S.amberSoft}`} data-testid="pt-reconfirm-strip">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${S.amberBg}`}>
            <DIcon name="history_toggle_off" className="text-[20px]" />
          </div>
          <div className="flex flex-1 flex-col">
            <div className={`${T.labelLg} font-semibold text-[#291800] dark:text-[#fde68a]`}>
              The car&apos;s details changed after it was confirmed. Please check the powertrain again.
            </div>
            {raw ? (
              <p className={`mt-0.5 ${T.bodySm} ${S.muted}`}>The car&apos;s record now says &lsquo;{raw}&rsquo;.</p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className={`flex flex-col gap-1 rounded-xl p-4 ${S.low}`}>
            <span className={`${T.labelSm} uppercase tracking-wider ${S.outline}`}>Last confirmed values</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${T.labelMd} ${S.secContainer}`}>
                <DIcon name={ptIcon} className="text-[16px]" /> {ptName}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${T.labelMd} ${S.highest} ${S.text}`}>
                <DIcon name={fuIcon} className="text-[16px]" /> {fuName}
              </span>
            </div>
          </div>
          <div className={`flex flex-col gap-1 rounded-xl p-4 ${S.low}`}>
            <span className={`${T.labelSm} uppercase tracking-wider ${S.outline}`}>What changed</span>
            <div className="mt-2 flex items-start gap-2">
              <DIcon name="verified_user" className={`mt-0.5 shrink-0 text-[18px] ${S.primary}`} />
              <p className={`${T.bodySm} ${S.text}`}>
                <span className="font-medium">Last confirmed:</span> {ptName} · {fuName}
                {confirmedOn ? ` on ${confirmedOn}` : ""}
              </p>
            </div>
            {raw ? (
              <div className="mt-1 flex items-start gap-2">
                <DIcon name="sync_problem" className="mt-0.5 shrink-0 text-[18px] text-[#835500] dark:text-[#fbbf24]" />
                <p className={`${T.bodySm} ${S.muted}`}>
                  <span className={`font-medium ${S.text}`}>Car record now says:</span>{" "}
                  <span className={`${S.mono} ${T.labelSm} font-normal ${S.text} ${S.highest} rounded px-1.5 py-0.5`}>{raw}</span>
                </p>
              </div>
            ) : null}
          </div>
        </div>
        {failedStrip}
        {canWrite ? (
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2 pt-4">
            <button type="button" className={`${BTN_GREY} rounded-lg`} disabled={busy} onClick={startEdit}>
              <DIcon name="edit" className="text-[18px]" /> Edit
            </button>
            {canConfirm ? (
              <button type="button" className={`${BTN_PRIMARY} rounded-lg`} disabled={busy} onClick={() => void save(car.powertrain!, car.fuel!)}>
                <DIcon name="check_circle" className="text-[18px]" /> {busy ? "Saving…" : `Confirm ${ptName} · ${fuName}`}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  /* ---------- 01 Worked out (and a read-only needs_check view) ---------- */
  return (
    <section className={`${S.card} relative flex flex-col gap-6 overflow-hidden p-7`} data-testid="powertrain-card" data-mode={mode}>
      {glow}
      {header}
      <div className={`relative flex items-start gap-3 rounded-xl bg-[#dbe1ff]/30 p-4 dark:bg-[#1e3a8a]/20 ${S.text}`}>
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#003ea9] text-white dark:bg-[#2563eb]">
          <DIcon name="info" className="text-[16px]" />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className={`${T.bodyMd} font-medium ${S.text}`}>Roam worked this out from the car&apos;s record</p>
          <p className={`${T.bodySm} ${S.muted}`}>
            It decides which maintenance jobs fleets with this car are offered. Check it, then confirm it or edit it.
          </p>
        </div>
      </div>
      <div className="relative flex flex-col gap-6 pt-2">
        <div className={`flex flex-col justify-between gap-2 border-b pb-6 sm:flex-row sm:items-start sm:gap-6 ${S.divider}`}>
          <div className="flex min-w-[140px] flex-col">
            <span className={`${T.labelLg} ${S.muted}`}>Powertrain</span>
            <span className={`${T.labelSm} ${S.outline}`}>What drives the wheels</span>
          </div>
          <div className="flex flex-col gap-1.5 sm:items-end">
            <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1 ${T.labelLg} bg-[#d9e2fe]/40 dark:bg-[#1e3a8a]/40 ${S.primary}`} data-testid="pt-value">
              <DIcon name={ptIcon} className="text-[16px]" /> {ptName}
            </span>
            <div className={`flex items-center gap-1 ${T.bodySm} ${S.muted}`}>
              <DIcon name="auto_awesome" className={`text-[14px] ${S.outline}`} />
              <span>
                Worked out from{" "}
                {raw ? <span className={`${S.mono} font-medium ${S.outline}`}>&quot;{raw}&quot;</span> : "the car's record"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-2 pb-2 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex min-w-[140px] flex-col">
            <span className={`${T.labelLg} ${S.muted}`}>Fuel</span>
            <span className={`${T.labelSm} ${S.outline}`}>What goes in the tank</span>
          </div>
          <div className="flex flex-col gap-1.5 sm:items-end">
            <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1 ${T.labelLg} ${S.mid} ${S.text}`} data-testid="fuel-value">
              <DIcon name={fuIcon} className={`text-[16px] ${S.amberText}`} /> {fuName}
            </span>
          </div>
        </div>
      </div>
      {failed ? <SaveFailed busy={busy} onRetry={() => void save(failed[0], failed[1])} /> : null}
      {canWrite ? (
        <div className="flex flex-wrap items-center justify-end gap-4 border-t border-[#ecedf8] pt-4 dark:border-[#1e293b]">
          <div className="flex items-center gap-3">
            <button type="button" className={BTN_GREY} disabled={busy} onClick={startEdit}>
              <DIcon name="tune" className="text-[18px]" /> Edit
            </button>
            {car.powertrain && car.fuel ? (
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void save(car.powertrain!, car.fuel!)}>
                <DIcon name="check_circle" className="text-[18px]" /> {busy ? "Saving…" : "Confirm"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

type Option = { code: string; name: string; short?: string; hint?: string; icon: string; tile: string; pill?: string };

/** Stitch 02 select: a raised trigger box that opens an in-flow list of option rows. */
function PickField({
  label,
  value,
  current,
  options,
  onChange,
  disabled,
  help,
  helpIcon,
  listTitle,
  triggerAsChip,
  testId,
}: {
  label: string;
  value: string;
  current: string | null;
  options: Option[];
  onChange: (code: string) => void;
  disabled?: boolean;
  help: ReactNode;
  helpIcon: string;
  listTitle: string;
  triggerAsChip?: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.code === value);
  return (
    <div className="relative flex flex-col" data-testid={testId}>
      <span className={`mb-2 ${T.labelMd} font-semibold ${S.text}`}>{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 items-center justify-between rounded-lg bg-white px-4 shadow-sm ring-1 ring-[#e7e7f2] transition-colors hover:bg-[#f2f3fe] disabled:opacity-60 dark:bg-[#0b1220] dark:ring-[#1e293b] dark:hover:bg-[#111a2e]`}
      >
        <span className="flex items-center gap-2">
          {chosen ? (
            triggerAsChip ? (
              <>
                <DIcon name={chosen.icon} className="text-[18px] text-[#5b647c] dark:text-[#c7d2fe]" />
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 ${T.labelMd} font-semibold ${S.secContainer}`}>{chosen.short ?? chosen.name}</span>
              </>
            ) : (
              <>
                <DIcon name={chosen.icon} className={`text-[20px] ${S.outline}`} />
                <span className={`${T.bodyMd} font-medium ${S.text}`}>{chosen.name}</span>
              </>
            )
          ) : (
            <span className={`${T.bodyMd} ${S.outline}`}>Choose…</span>
          )}
        </span>
        <DIcon
          name={triggerAsChip ? "expand_more" : "unfold_more"}
          className={`text-[20px] transition-transform duration-200 ${open ? `rotate-180 ${S.primary}` : S.outline}`}
        />
      </button>
      <div className={`mt-2 flex items-start gap-1.5 ${T.bodySm} ${S.muted}`}>
        <DIcon name={helpIcon} className={`mt-0.5 text-[16px] ${S.outline}`} />
        <span>{help}</span>
      </div>
      {open ? (
        <div role="listbox" aria-label={label} className="mt-2 flex w-full flex-col gap-1 rounded-xl bg-white p-2 shadow-xl ring-1 ring-[#e7e7f2] dark:bg-[#111a2e] dark:ring-[#1e293b]">
          <div className={`px-3 py-1.5 ${T.labelSm} uppercase tracking-wider ${S.outline}`}>{listTitle}</div>
          {options.map((o) => {
            const sel = o.code === value;
            return (
              <button
                key={o.code}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => {
                  onChange(o.code);
                  setOpen(false);
                }}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                  sel ? "bg-[#dbe1ff]/40 shadow-sm dark:bg-[#1e3a8a]/40" : "hover:bg-[#f2f3fe] dark:hover:bg-[#0b1220]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      sel ? "bg-[#0153dc] text-white dark:bg-[#2563eb]" : o.tile
                    }`}
                  >
                    <DIcon name={o.icon} className="text-[18px]" />
                  </span>
                  <span className="flex flex-col">
                    <span className="flex items-center gap-2">
                      <span className={`${T.labelLg} ${sel ? `font-semibold ${S.primary}` : S.text}`}>{o.name}</span>
                      {o.code === current ? (
                        <span className={`rounded-full px-2 ${T.labelSm} ${S.secContainer}`}>Current</span>
                      ) : null}
                    </span>
                    {o.hint ? <span className={`${T.bodySm} ${sel ? S.primary : S.muted}`}>{o.hint}</span> : null}
                  </span>
                </span>
                {sel ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0153dc] text-white dark:bg-[#2563eb]">
                    <DIcon name="check" className="text-[16px]" />
                  </span>
                ) : o.pill ? (
                  <span className={`rounded-full px-2.5 py-0.5 ${T.labelSm} ${S.high} ${S.muted}`}>{o.pill}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
