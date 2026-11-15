/**
 * Service items — Add / Edit supply drawer.
 * Look: Stitch screen 6 (edit_supply_drawer). Content: audit 9c (Drop "Standard PM Kit Template A", "Depot Location").
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createSupply,
  JOB_ICON_KEYS,
  updateSupply,
  type Job,
  type JobsPayload,
  type Supply,
} from "../jobs/jobsApi";
import { jobsUsingSupply } from "../jobs/mayNeedModel";
import { BlueButton, RedOutlineButton, T, supplyIcon } from "../jobs/serviceItemsUi";
import { RetireSupplyDialog } from "./RetireSupplyDialog";

type Props = {
  token: string;
  data: JobsPayload;
  /** null = add a new supply. */
  supply: Supply | null;
  canWrite: boolean;
  /** Prefills the name (from the Add dialog's search). */
  initialName?: string;
  onClose: () => void;
  onSaved: (s: Supply) => void;
  /** Called after a retire; the drawer closes itself. */
  onRetired?: (s: Supply, hiddenFromJobs: number) => void;
  /** Opens a job's drawer from the "Used on" card. */
  onOpenJob?: (job: Job) => void;
};

const NAME_MAX = 120;

export function SupplyDrawer({ token, data, supply, canWrite, initialName, onClose, onSaved, onRetired, onOpenJob }: Props) {
  const [name, setName] = useState(supply?.name ?? initialName ?? "");
  const [description, setDescription] = useState(supply?.description ?? "");
  const [unitId, setUnitId] = useState(supply?.unitId ?? data.units[0]?.id ?? "");
  const [iconKey, setIconKey] = useState(supply?.iconKey ?? "wrench");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retireOpen, setRetireOpen] = useState(false);

  const usedOn = useMemo(() => (supply ? jobsUsingSupply(data, supply.id) : []), [data, supply]);
  const tidyName = name.trim().replace(/\s+/g, " ");
  const canSave = canWrite && tidyName.length > 0 && tidyName.length <= NAME_MAX && description.trim() && unitId && !busy;
  const retired = supply?.status === "retired";

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError("");
    try {
      const input = { name: tidyName, description: description.trim(), unitId, iconKey };
      const res = supply ? await updateSupply(token, supply.id, input) : await createSupply(token, input);
      toast.success(supply ? `${res.item.name} saved` : `${res.item.name} added`);
      onSaved(res.item);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't save this supply.");
    } finally {
      setBusy(false);
    }
  };

  const field = `rounded-lg bg-[#ffffff] ${T.bodyMd} text-[#161b27] shadow-[inset_0_0_0_1px_#e2e8f0] outline-none transition-all placeholder:text-[#737686]/70 focus:ring-2 focus:ring-[#0153dc]/20 disabled:bg-[#f1f3ff] disabled:text-[#565e74]`;

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-black/30"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="mm-supply-drawer-title"
        className="flex h-full w-[500px] max-w-full flex-col rounded-l-2xl bg-[#ffffff] shadow-2xl"
      >
        <header className="shrink-0 px-6 pb-3 pt-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {supply ? (
                <span className={`rounded-md bg-[#f1f3ff] px-2 py-0.5 font-mono ${T.labelMd} tracking-tight text-[#565e74]`}>{supply.code}</span>
              ) : null}
              {supply ? (
                retired ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-full bg-[#dee2f3] px-2.5 py-0.5 ${T.labelSm} text-[#434655]`}>
                    <span className="material-symbols-outlined text-[14px]">archive</span>
                    Retired
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] px-2.5 py-0.5 ${T.labelSm} text-[#047857]`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                    Active
                  </span>
                )
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close drawer"
              onClick={onClose}
              disabled={busy}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#737686] transition-colors hover:bg-[#f1f3ff] hover:text-[#161b27]"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <h2 id="mm-supply-drawer-title" className={`${T.headlineXl} text-[#161b27]`}>
            {supply ? supply.name : "Add supply"}
          </h2>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-2">
          <div className="flex flex-col">
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="mm-supply-name" className={`${T.labelMd} text-[#161b27]`}>
                Name
              </label>
              <span className={`${T.labelSm} ${name.length > NAME_MAX ? "text-[#ba1a1a]" : "text-[#737686]"}`}>
                {name.length} / {NAME_MAX}
              </span>
            </div>
            <input
              id="mm-supply-name"
              className={`h-10 px-3.5 ${field}`}
              value={name}
              disabled={!canWrite}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col">
            <label htmlFor="mm-supply-description" className={`${T.labelMd} mb-1.5 text-[#161b27]`}>
              Description
            </label>
            <textarea
              id="mm-supply-description"
              rows={3}
              className={`resize-none p-3.5 leading-relaxed ${field}`}
              value={description}
              disabled={!canWrite}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-1.5 text-[#737686]">
              <span className="material-symbols-outlined shrink-0 text-[16px]">info</span>
              <span className={`${T.bodySm} text-[#565e74]`}>Shown when someone taps ⓘ while logging.</span>
            </div>
          </div>

          <div className="flex flex-col">
            <label htmlFor="mm-supply-unit" className={`${T.labelMd} mb-1.5 text-[#161b27]`}>
              Unit
            </label>
            <div className="relative">
              <select
                id="mm-supply-unit"
                className={`h-10 w-full cursor-pointer appearance-none pl-3.5 pr-10 ${field}`}
                value={unitId}
                disabled={!canWrite}
                onChange={(e) => setUnitId(e.target.value)}
              >
                {data.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.labelOne}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[20px] text-[#737686]">
                expand_more
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            <span className={`${T.labelMd} mb-2.5 text-[#161b27]`}>Icon</span>
            <div role="radiogroup" aria-label="Icon choices" className="grid grid-cols-8 gap-2">
              {JOB_ICON_KEYS.map((k) => {
                const on = iconKey === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`Icon ${k}`}
                    disabled={!canWrite}
                    onClick={() => setIconKey(k)}
                    className={
                      on
                        ? "relative flex h-10 w-10 items-center justify-center rounded-full bg-[#dae2fd] text-[#0153dc] shadow-[0_0_0_2px_#fff,0_0_0_4px_#0153dc]"
                        : "flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f3ff] text-[#565e74] transition-all hover:bg-[#e9edfe] hover:text-[#161b27] active:scale-95"
                    }
                  >
                    <span className="material-symbols-outlined text-[20px]" style={on ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                      {supplyIcon(k)}
                    </span>
                    {on ? (
                      <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#0153dc] text-white">
                        <span className="material-symbols-outlined text-[10px]">check</span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {supply ? (
            <div className="flex items-center gap-3 rounded-xl bg-[#f1f3ff]/70 p-3.5 shadow-[inset_0_0_0_1px_#e2e8f0]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ffffff] text-[#0153dc]">
                <span className="material-symbols-outlined text-[18px]">build_circle</span>
              </div>
              <p className={`${T.bodySm} font-medium leading-snug text-[#161b27]`}>
                {usedOn.length === 0 ? (
                  "Not on any job yet."
                ) : (
                  <>
                    Used on {usedOn.length} job{usedOn.length === 1 ? "" : "s"}:{" "}
                    {usedOn.map((j, i) => (
                      <span key={j.id}>
                        {i > 0 ? ", " : ""}
                        <button
                          type="button"
                          onClick={() => onOpenJob?.(j)}
                          disabled={!onOpenJob}
                          className="rounded border border-[#c3c6d7]/60 px-1.5 py-0.5 text-[#0153dc] hover:bg-[#ffffff]"
                        >
                          {j.name}
                        </button>
                      </span>
                    ))}
                    .
                  </>
                )}
              </p>
            </div>
          ) : null}

          {supply ? (
            <div className="space-y-2.5 rounded-xl bg-[#ffffff] p-3.5 shadow-[inset_0_0_0_1px_#e2e8f0]">
              <MetaRow label="Created by" value={supply.createdByName ?? (supply.createdAt ? "Set up with the catalogue" : "—")} />
              <MetaRow label="Created" value={formatWhen(supply.createdAt)} />
              <MetaRow
                label="Last modified"
                value={`${formatWhen(supply.updatedAt)}${supply.updatedByName ? ` · ${supply.updatedByName}` : ""}`}
              />
            </div>
          ) : null}

          {error ? (
            <p role="alert" className={`rounded-lg bg-[#ffdad6]/50 px-3 py-2 ${T.bodySm} text-[#93000a]`}>
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between bg-[#ffffff] px-6 py-4 shadow-[inset_0_1px_0_#e2e8f0]">
          {supply && canWrite && !retired ? (
            <RedOutlineButton icon="delete_outline" disabled={busy} onClick={() => setRetireOpen(true)}>
              Retire
            </RedOutlineButton>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <RedOutlineButton onClick={onClose} disabled={busy}>
              Cancel
            </RedOutlineButton>
            {canWrite ? (
              <BlueButton icon="check" disabled={!canSave} onClick={() => void save()} className="rounded-lg">
                {busy ? "Saving…" : "Save supply"}
              </BlueButton>
            ) : null}
          </div>
        </footer>
      </aside>

      {retireOpen && supply ? (
        <RetireSupplyDialog
          token={token}
          supply={supply}
          jobs={usedOn}
          onClose={() => setRetireOpen(false)}
          onRetired={(s, hidden) => {
            setRetireOpen(false);
            onRetired?.(s, hidden);
          }}
        />
      ) : null}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`${T.labelSm} text-[#565e74]`}>{label}</span>
      <span className={`${T.labelSm} text-right text-[#161b27]`}>{value}</span>
    </div>
  );
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-JM", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
