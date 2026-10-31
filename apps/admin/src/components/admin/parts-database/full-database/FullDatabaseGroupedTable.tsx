import { useState } from "react";
import type { MasterPartRow, SisterFamilyRow, UniversalCatalogRow } from "../partsDatabaseApi";

const GROUPS = [
  { id: "oem", title: "Made for the car", tag: "OEM", dot: "#0153dc" },
  { id: "sister", title: "Same car, different badge", tag: "Sister", dot: "#0e7490" },
  { id: "engine", title: "Fits the engine", tag: "Engine", dot: "#b45309" },
  { id: "aftermarket", title: "Other brands", tag: "Aftermarket", dot: "#7c3aed" },
  { id: "universal", title: "Fits by size", tag: "Universal", dot: "#006e31" },
] as const;

type GroupId = (typeof GROUPS)[number]["id"];

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function StatusChip({ status }: { status: string }) {
  const verified = status === "verified";
  return (
    <span className={verified
      ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-700/20 text-emerald-800 font-label-xs font-semibold"
      : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-600/20 text-amber-700 font-label-xs font-semibold"}>
      <span className={`w-1.5 h-1.5 rounded-full ${verified ? "bg-emerald-700" : "bg-amber-600"}`} />
      {verified ? "Verified" : "Needs checking"}
    </span>
  );
}

function IconButton({ icon, label, disabled, title, danger, onClick }: {
  icon: string;
  label: string;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`p-1 rounded hover:bg-surface-container-lowest disabled:opacity-40 ${danger ? "hover:text-error" : "hover:text-primary"}`} type="button" title={title ?? label} disabled={disabled} onClick={onClick}>
      <span className="material-symbols-outlined text-[17px]">{icon}</span>
    </button>
  );
}

export function FullDatabaseGroupedTable({
  match,
  parts,
  sisters,
  universals,
  counts,
  emptyTiers,
  total,
  page,
  pageSize,
  owner,
  onPage,
  onView,
  onEdit,
  onDelete,
  onNewFamily,
  onAddCar,
  onRemoveCar,
  onAddUniversal,
  onEditUniversal,
  onDeleteUniversal,
  onViewUniversal,
  onAddEngine,
}: {
  match: string;
  parts: { oem: MasterPartRow[]; engine: MasterPartRow[]; aftermarket: MasterPartRow[] };
  sisters: SisterFamilyRow[];
  universals: UniversalCatalogRow[];
  counts: Record<string, number>;
  emptyTiers: string[];
  total: number;
  page: number;
  pageSize: number;
  owner: boolean;
  onPage: (page: number) => void;
  onView: (partId: string) => void;
  onEdit: (row: MasterPartRow) => void;
  onDelete: (row: MasterPartRow) => void;
  onNewFamily: () => void;
  onAddCar: (family: SisterFamilyRow) => void;
  onRemoveCar: (family: SisterFamilyRow) => void;
  onAddUniversal: () => void;
  onEditUniversal: (row: UniversalCatalogRow) => void;
  onDeleteUniversal: (row: UniversalCatalogRow) => void;
  onViewUniversal: (row: UniversalCatalogRow) => void;
  onAddEngine: () => void;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  const visible = GROUPS.filter((group) => match === "all" || match === group.id);
  const shown = visible.reduce((sum, group) => {
    if (group.id === "sister") return sum + sisters.length;
    if (group.id === "universal") return sum + universals.length;
    return sum + parts[group.id].length;
  }, 0);
  const pages = Math.max(1, Math.ceil((match === "all" ? shown : total) / pageSize));

  function rowsFor(id: GroupId): MasterPartRow[] {
    if (id === "oem" || id === "engine" || id === "aftermarket") return parts[id];
    return [];
  }

  return (
    <div className="w-full rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm overflow-hidden flex flex-col">
      {visible.map((group) => {
        const count = counts[group.id] ?? 0;
        if (match === "all" && count === 0) return null;
        const open = !closed[group.id];
        return (
          <div key={group.id} className="border-b border-outline-variant/40">
            <div className="group-head px-space-md py-2.5 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.dot }} />
                <span className="group-title font-headline-md text-headline-md font-bold text-on-surface">{group.title}</span>
                <span className="group-inline-meta px-2 py-0.2 rounded bg-surface-container text-secondary font-mono-sm text-[11px] font-bold">{group.tag}</span>
                <span className="group-inline-meta text-secondary font-mono-sm text-mono-sm">· {count} {group.id === "sister" ? "families" : "records"}</span>
              </div>
              <div className="group-meta flex items-center gap-2 flex-wrap">
                <span className="group-phone-meta px-2 py-0.2 rounded bg-surface-container text-secondary font-mono-sm text-[11px] font-bold">{group.tag}</span>
                <span className="group-phone-meta text-secondary font-mono-sm text-mono-sm">· {count} {group.id === "sister" ? "families" : "records"}</span>
                {group.id === "sister" ? (
                  <button type="button" className="font-body-sm text-primary font-semibold disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onNewFamily}>New family</button>
                ) : null}
                {group.id === "universal" ? (
                  <button type="button" className="font-body-sm text-primary font-semibold disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAddUniversal}>Add size-based part</button>
                ) : null}
                <button type="button" className="text-outline hover:text-on-surface p-1" title={open ? "Collapse group" : "Expand group"} onClick={() => setClosed((current) => ({ ...current, [group.id]: open }))}>
                  <span className="material-symbols-outlined text-[18px]">{open ? "expand_less" : "expand_more"}</span>
                </button>
              </div>
            </div>
            {open ? (
              <div className="overflow-x-auto">
                {group.id === "sister" ? (
                  <SisterTable rows={sisters} owner={owner} ownerTitle={ownerTitle} onAddCar={onAddCar} onRemoveCar={onRemoveCar} />
                ) : group.id === "universal" ? (
                  <UniversalTable rows={universals} owner={owner} ownerTitle={ownerTitle} onView={onViewUniversal} onEdit={onEditUniversal} onDelete={onDeleteUniversal} />
                ) : (
                  <PartTable rows={rowsFor(group.id)} dot={group.dot} owner={owner} ownerTitle={ownerTitle} onView={onView} onEdit={onEdit} onDelete={onDelete} />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
      {match === "all" && emptyTiers.length ? (
        <div className="px-space-md py-2.5 bg-surface-container-low border-b border-outline-variant/40 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[12px]">
          <div className="flex items-center gap-2 font-mono-sm text-mono-sm min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#b45309]/50 shrink-0" />
            <span className="text-on-surface-variant font-medium">Nothing on file for: {emptyTiers.join(", ")}.</span>
            <span className="text-outline">· 0 records matched for current filter</span>
          </div>
          {emptyTiers.includes("Fits the engine") ? (
            <button type="button" className="font-body-sm text-[12px] text-primary hover:underline font-semibold disabled:opacity-40 shrink-0" disabled={!owner} title={ownerTitle} onClick={onAddEngine}>+ Add an engine fitment</button>
          ) : null}
        </div>
      ) : null}
      <div className="px-space-md py-2.5 bg-surface-container-low flex items-center justify-between gap-2">
        <span className="font-body-sm text-body-sm text-secondary">Showing <strong className="font-bold text-on-surface">{shown} of {total}</strong> records</span>
        <div className="flex items-center gap-2 font-body-sm">
          <button className="px-3 h-8 rounded-lg bg-surface-container-lowest border border-outline-variant/60 text-secondary disabled:opacity-40" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-container text-on-primary font-mono-sm font-bold">{page}</span>
          <button className="px-3 h-8 rounded-lg bg-surface-container-lowest border border-outline-variant/60 text-secondary disabled:opacity-40" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}

function PartTable({ rows, dot, owner, ownerTitle, onView, onEdit, onDelete }: {
  rows: MasterPartRow[];
  dot: string;
  owner: boolean;
  ownerTitle?: string;
  onView: (partId: string) => void;
  onEdit: (row: MasterPartRow) => void;
  onDelete: (row: MasterPartRow) => void;
}) {
  return (
    <>
      <table className="hidden md:table w-full text-left border-collapse">
        <thead>
          <tr className="bg-surface border-b border-outline-variant/40 font-mono-sm text-[11px] uppercase text-secondary tracking-wider h-9">
            <th className="px-space-md font-semibold">Part</th>
            <th className="px-space-md font-semibold">Number</th>
            <th className="px-space-md font-semibold">Brand</th>
            <th className="px-space-md font-semibold">Area</th>
            <th className="px-space-md font-semibold">Cars it fits</th>
            <th className="px-space-md font-semibold">Status</th>
            <th className="px-space-md text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30 font-body-sm text-body-sm text-on-surface">
          {rows.length === 0 ? <tr><td className="px-space-md py-4 text-secondary" colSpan={7}>None on file for this filter.</td></tr> : rows.map((row) => (
            <tr key={row.partId} className="h-11 hover:bg-surface-container-low">
              <td className="px-space-md font-semibold">
                <span className="inline-flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot }} />{row.name || "Part"}</span>
              </td>
              <td className="px-space-md font-mono-sm font-bold text-primary">{row.number || "—"}</td>
              <td className="px-space-md">{row.brand || "—"}</td>
              <td className="px-space-md text-secondary">{row.assembly || "—"}</td>
              <td className="px-space-md font-mono-sm text-on-surface-variant">{row.fittedCars || "—"}{row.versionCount ? ` · ${row.versionCount} versions` : ""}</td>
              <td className="px-space-md"><StatusChip status={row.status} /></td>
              <td className="px-space-md text-right">
                <div className="flex items-center justify-end gap-1 text-secondary">
                  <IconButton icon="visibility" label="View details" onClick={() => onView(row.partId)} />
                  <IconButton icon="edit" label="Edit" disabled={!owner} title={ownerTitle} onClick={() => onEdit(row)} />
                  <IconButton icon="delete" label="Delete" danger disabled={!owner} title={ownerTitle} onClick={() => onDelete(row)} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="md:hidden flex flex-col divide-y divide-outline-variant/30">
        {rows.map((row) => (
          <div key={row.partId} className="p-3 flex flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-on-surface">{row.name || "Part"}</p>
                <p className="font-mono-sm text-primary">{row.number || "—"}</p>
              </div>
              <StatusChip status={row.status} />
            </div>
            <p className="text-secondary text-[12px]">{row.brand || "—"} · {row.assembly || "—"}</p>
            <div className="flex justify-end gap-1 text-secondary">
              <IconButton icon="visibility" label="View details" onClick={() => onView(row.partId)} />
              <IconButton icon="edit" label="Edit" disabled={!owner} title={ownerTitle} onClick={() => onEdit(row)} />
              <IconButton icon="delete" label="Delete" danger disabled={!owner} title={ownerTitle} onClick={() => onDelete(row)} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SisterTable({ rows, owner, ownerTitle, onAddCar, onRemoveCar }: {
  rows: SisterFamilyRow[];
  owner: boolean;
  ownerTitle?: string;
  onAddCar: (family: SisterFamilyRow) => void;
  onRemoveCar: (family: SisterFamilyRow) => void;
}) {
  return (
    <>
      <table className="hidden md:table w-full text-left border-collapse">
        <thead>
          <tr className="bg-surface border-b border-outline-variant/40 font-mono-sm text-[11px] uppercase text-secondary tracking-wider h-9">
            <th className="px-space-md font-semibold">Family</th>
            <th className="px-space-md font-semibold">Chassis codes</th>
            <th className="px-space-md font-semibold">Cars</th>
            <th className="px-space-md text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30 font-body-sm text-on-surface">
          {rows.length === 0 ? <tr><td className="px-space-md py-4 text-secondary" colSpan={4}>None on file for this filter.</td></tr> : rows.map((row) => (
            <tr key={row.id} className="h-11">
              <td className="px-space-md font-semibold">{row.label || "Family"}</td>
              <td className="px-space-md font-mono-sm">{row.chassisCodes || "—"}</td>
              <td className="px-space-md">
                <span className="flex flex-wrap gap-1">
                  {(row.cars ?? []).map((car) => <span key={car} className="px-2 py-0.5 rounded-full bg-surface-container text-[11px]">{car}</span>)}
                </span>
              </td>
              <td className="px-space-md text-right">
                <button type="button" className="text-primary font-semibold text-[12px] disabled:opacity-40 mr-2" disabled={!owner} title={ownerTitle} onClick={() => onAddCar(row)}>Add a car</button>
                <button type="button" className="text-secondary text-[12px] disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => onRemoveCar(row)}>Remove a car</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="md:hidden flex flex-col divide-y divide-outline-variant/30">
        {rows.map((row) => (
          <div key={row.id} className="p-3 flex flex-col gap-1">
            <p className="font-semibold text-on-surface">{row.label || "Family"}</p>
            <p className="font-mono-sm text-secondary">{row.chassisCodes || "—"}</p>
            <span className="flex flex-wrap gap-1">
              {(row.cars ?? []).map((car) => <span key={car} className="px-2 py-0.5 rounded-full bg-surface-container text-[11px]">{car}</span>)}
            </span>
            <div className="flex justify-end gap-2">
              <button type="button" className="text-primary font-semibold text-[12px] disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => onAddCar(row)}>Add a car</button>
              <button type="button" className="text-secondary text-[12px] disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => onRemoveCar(row)}>Remove a car</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function UniversalTable({ rows, owner, ownerTitle, onView, onEdit, onDelete }: {
  rows: UniversalCatalogRow[];
  owner: boolean;
  ownerTitle?: string;
  onView: (row: UniversalCatalogRow) => void;
  onEdit: (row: UniversalCatalogRow) => void;
  onDelete: (row: UniversalCatalogRow) => void;
}) {
  return (
    <>
    <table className="hidden md:table w-full text-left border-collapse">
      <thead>
        <tr className="bg-surface border-b border-outline-variant/40 font-mono-sm text-[11px] uppercase text-secondary tracking-wider h-9">
          <th className="px-space-md font-semibold">Name</th>
          <th className="px-space-md font-semibold">Number</th>
          <th className="px-space-md font-semibold">Brand</th>
          <th className="px-space-md font-semibold">Fits cars with</th>
          <th className="px-space-md font-semibold">Source</th>
          <th className="px-space-md text-right font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-outline-variant/30 font-body-sm text-on-surface">
        {rows.length === 0 ? <tr><td className="px-space-md py-4 text-secondary" colSpan={6}>None on file for this filter.</td></tr> : rows.map((row) => (
          <tr key={row.id} className="h-11">
            <td className="px-space-md font-medium">{row.name || "Part"}</td>
            <td className="px-space-md font-mono-sm font-semibold">{row.number || "—"}</td>
            <td className="px-space-md">{row.brand || "—"}</td>
            <td className="px-space-md"><span className="px-2 py-0.5 rounded bg-primary-fixed/30 text-primary font-mono-sm text-[11px] font-bold">{row.fits || "—"}</span></td>
            <td className="px-space-md font-mono-sm">
              {row.source ? <a className="text-primary hover:underline inline-flex items-center gap-1" href={row.source} target="_blank" rel="noreferrer">{hostLabel(row.source)} <span className="material-symbols-outlined text-[13px]">north_east</span></a> : "—"}
            </td>
            <td className="px-space-md text-right">
              <div className="flex items-center justify-end gap-1 text-secondary">
                <IconButton icon="visibility" label="View" onClick={() => onView(row)} />
                <IconButton icon="edit" label="Edit" disabled={!owner} title={ownerTitle} onClick={() => onEdit(row)} />
                <IconButton icon="delete" label="Delete" danger disabled={!owner} title={ownerTitle} onClick={() => onDelete(row)} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="md:hidden flex flex-col divide-y divide-outline-variant/30">
      {rows.map((row) => (
        <div key={row.id} className="p-3 flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-on-surface">{row.name || "Part"}</p>
              <p className="font-mono-sm text-primary">{row.number || "—"}</p>
            </div>
            <span className="px-2 py-0.5 rounded bg-primary-fixed/30 text-primary font-mono-sm text-[11px] font-bold">{row.fits || "—"}</span>
          </div>
          <p className="text-secondary text-[12px]">{row.brand || "—"}</p>
          <div className="flex justify-end gap-1 text-secondary">
            <IconButton icon="visibility" label="View" onClick={() => onView(row)} />
            <IconButton icon="edit" label="Edit" disabled={!owner} title={ownerTitle} onClick={() => onEdit(row)} />
            <IconButton icon="delete" label="Delete" danger disabled={!owner} title={ownerTitle} onClick={() => onDelete(row)} />
          </div>
        </div>
      ))}
    </div>
    </>
  );
}
