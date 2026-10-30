// Stitch: dominion-redesign/categories_tree_tab_gas_station_selected
import { AttributeFields } from "../AttributeFields";
import {
  changeBy,
  changeWhen,
  matchLabel,
  typeMark,
  type AdminTaxonomy,
  type ChangeRow,
  type FacilityRow,
  type PlaceTypeRow,
  type SelectedRef,
} from "./categoriesFormat";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

export function TaxonomyDetail({
  tree,
  selected,
  changes,
  canWrite,
  onEdit,
  onRetire,
}: {
  tree: AdminTaxonomy;
  selected: SelectedRef | null;
  changes: ChangeRow[];
  canWrite: boolean;
  onEdit: () => void;
  onRetire: () => void;
}) {
  const place = selected?.table === "place_type"
    ? tree.placeTypes.find((row) => row.slug === selected.id) || null
    : null;
  const facility = selected?.table === "facility_type"
    ? tree.facilityTypes.find((row) => row.slug === selected.id) || null
    : null;
  const category = selected?.table === "category"
    ? tree.categories.find((row) => row.code === selected.id) || null
    : null;
  const group = selected?.table === "category_group"
    ? tree.groups.find((row) => row.code === selected.id) || null
    : null;

  if (!selected || (!place && !facility && !category && !group)) {
    return (
      <div className="col-span-12 flex min-h-[640px] items-center justify-center rounded-2xl bg-surface-container-lowest p-6 text-sm text-on-surface-variant shadow-sm lg:col-span-7">
        Choose a group, category, or place type.
      </div>
    );
  }

  if (place) return (
    <PlaceDetail
      tree={tree}
      place={place}
      changes={changes}
      canWrite={canWrite}
      onEdit={onEdit}
      onRetire={onRetire}
    />
  );

  const label = facility?.label || category?.label || group?.label || "";
  const key = facility?.slug || category?.code || group?.code || "";
  const kind = facility ? "Facility type" : category ? "Category" : "Group";
  const parent = facility?.group_label || category?.parent_label || "";
  const used = facility ? facility.facilities_used : group ? group.places : category ? category.type_count : 0;

  return (
    <div className="col-span-12 flex min-h-[640px] flex-col justify-between rounded-2xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-7">
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline text-lg font-bold text-on-surface">{label}</h2>
            <span className="rounded bg-surface-container px-2 py-0.5 font-mono text-xs text-on-surface-variant">{key}</span>
            <span className="rounded-full bg-surface-container px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">{kind}</span>
          </div>
          {parent && <p className="mt-1 text-xs text-outline">{parent}</p>}
        </div>
        <p className="text-xs text-on-surface-variant">Used by: {used}</p>
        <section className="space-y-2 pt-1">
          <h3 className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Recent changes</h3>
          <ChangeList changes={changes} />
        </section>
      </div>
      <DetailActions canWrite={canWrite} onEdit={onEdit} onRetire={onRetire} />
    </div>
  );
}

function PlaceDetail({
  tree,
  place,
  changes,
  canWrite,
  onEdit,
  onRetire,
}: {
  tree: AdminTaxonomy;
  place: PlaceTypeRow;
  changes: ChangeRow[];
  canWrite: boolean;
  onEdit: () => void;
  onRetire: () => void;
}) {
  const heading = place.label || "Gas station";
  const mark = typeMark(place.slug, place.icon);
  const facilities = place.default_facilities.map((slug) => tree.facilityTypes.find((row) => row.slug === slug)?.label || slug);
  return (
    <div className="col-span-12 flex min-h-[640px] flex-col justify-between rounded-2xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-7">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-high text-2xl shadow-inner">
              {mark || <Icon name={place.grid_icon || place.icon || "pin_drop"} className="text-[22px] text-secondary" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline text-lg font-bold text-on-surface">{heading}</h2>
                <span className="rounded bg-surface-container px-2 py-0.5 font-mono text-xs text-on-surface-variant">{place.slug}</span>
                <span className="rounded-full bg-surface-container px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Place type</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 font-body text-xs text-outline">
                <span>{place.group_label}</span>
                <span>›</span>
                <span className="font-medium text-on-surface-variant">{place.parent_label}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-on-surface-variant">Used by:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f4ea] px-2.5 py-1 font-mono text-xs font-medium text-[#137333]">
            <Icon name="local_gas_station" className="text-[14px]" />
            <span>{place.places} places</span>
          </span>
          {place.in_plug && (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container px-2.5 py-1 font-mono text-xs font-medium text-on-secondary-container">
              <Icon name="bolt" className="text-[14px]" />
              <span>In Plug</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 font-mono text-xs font-medium text-on-surface">
            <Icon name="hub" className="text-[14px]" />
            <span>{matchLabel(place.match_profile)}</span>
          </span>
        </div>
        <div className="space-y-2.5 pt-2">
          <h3 className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Settings</h3>
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-container-low p-3.5 font-mono text-xs">
            <div className="flex flex-col gap-1">
              <span className="font-sans text-[11px] text-outline">Geofence radius</span>
              <span className="font-medium text-on-surface">{place.default_geofence_m} m</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 font-sans text-[11px] text-outline" title="Set by the engines. Changed only by a release.">
                <span>Match profile</span>
                <Icon name="lock" className="text-[12px]" />
              </div>
              <span className="font-medium text-on-surface">{place.match_profile}</span>
            </div>
            <div className="col-span-2 flex flex-col gap-1 pt-1">
              <span className="font-sans text-[11px] text-outline">Engine Icon identifier</span>
              <div className="flex items-center gap-1.5 font-medium text-on-surface">
                <Icon name={place.grid_icon || place.icon || "pin_drop"} className="text-[15px] text-secondary" />
                <span>{place.grid_icon || place.icon || "pin_drop"}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-2 pt-1">
          <h3 className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Default facilities</h3>
          <div className="flex flex-wrap gap-2">
            {facilities.length === 0 && <span className="text-xs text-outline">Not used yet</span>}
            {facilities.map((label) => (
              <span key={label} className="inline-flex items-center gap-1 rounded-lg bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface">
                <Icon name="storefront" className="text-[14px] text-on-surface-variant" />
                <span>{label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-2 pt-1">
          <h3 className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Fields this type stores</h3>
          <div className="rounded-xl bg-surface-container-low p-3.5 text-xs">
            <AttributeFields schema={place.attribute_schema} value={{}} onChange={() => {}} />
            {!place.attribute_schema?.properties && <p className="text-[11px] text-outline">The data is not in yet.</p>}
          </div>
        </div>
        <div className="space-y-2 pt-1">
          <h3 className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Plug chip</h3>
          <div className="flex items-center gap-6 rounded-xl bg-surface-container-low p-4">
            <div className="flex w-36 flex-col items-center justify-center rounded-lg bg-surface-container-lowest p-3 shadow-sm">
              {place.in_plug ? (
                <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-on-secondary shadow-sm">
                  <Icon name={place.grid_icon || "local_gas_station"} className="text-[14px]" />
                  <span>{place.plug_label || heading}</span>
                </div>
              ) : (
                <span className="text-[11px] text-outline">Not in Plug</span>
              )}
              <span className="mt-2 font-mono text-[10px] text-outline">Live appearance</span>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
              <Field label="Label" value={place.plug_label || "—"} />
              <Field label="Map label" value={place.plug_map_label || "—"} />
              <Field label="Order weight" value={place.grid_sort == null ? "—" : String(place.grid_sort)} />
              <div className="flex flex-col">
                <span className="font-sans text-[11px] text-outline">Empty hint</span>
                <span className="font-sans text-[11px] italic text-outline-variant">{place.empty_hint || "—"}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-2 pt-1">
          <h3 className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Recent changes</h3>
          <ChangeList changes={changes} />
        </div>
      </div>
      <DetailActions canWrite={canWrite} onEdit={onEdit} onRetire={onRetire} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-sans text-[11px] text-outline">{label}</span>
      <span className="font-medium text-on-surface">{value}</span>
    </div>
  );
}

function ChangeList({ changes }: { changes: ChangeRow[] }) {
  if (!changes.length) return <p className="text-xs text-outline">The data is not in yet.</p>;
  return (
    <div className="space-y-1 font-mono text-xs">
      {changes.slice(0, 10).map((row) => (
        <div key={row.id} className="flex items-center justify-between rounded bg-surface-container-low px-2.5 py-1 text-on-surface">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-outline">{changeWhen(row.at)}</span>
            <span>{row.reason || row.action}</span>
          </div>
          <span className="text-[11px] text-outline">{changeBy(row.actor_id)}</span>
        </div>
      ))}
    </div>
  );
}

function DetailActions({ canWrite, onEdit, onRetire }: { canWrite: boolean; onEdit: () => void; onRetire: () => void }) {
  if (!canWrite) return null;
  return (
    <div className="mt-6 flex items-center justify-between bg-surface-container-lowest pt-6">
      <button type="button" className="flex items-center gap-1.5 rounded-lg bg-surface-container px-4 py-1.5 text-xs font-semibold text-on-surface shadow-sm hover:bg-surface-container-high" onClick={onEdit}>
        <Icon name="edit" className="text-[15px]" />
        <span>Edit</span>
      </button>
      <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/5" onClick={onRetire}>
        Retire…
      </button>
    </div>
  );
}

export type { FacilityRow, PlaceTypeRow };
