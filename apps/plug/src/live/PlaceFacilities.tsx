import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { plugSend, publicGet } from "../api";

type Facility = { id?: string; type?: string; category?: string; label?: string | null };
type Group = { code: string; label: string; colour: string };
type Category = { code: string; group_code: string; label: string };
type FacilityType = { slug: string; label: string; category_code: string };

export function PlaceFacilities() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const highlight = params.get("facility") || "";
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [types, setTypes] = useState<FacilityType[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      publicGet<{ groups?: Group[]; categories?: Category[]; facilityTypes?: FacilityType[] }>("/places/taxonomy"),
      publicGet<{ place?: { facilities?: Facility[] } }>(`/places/${encodeURIComponent(id)}`),
    ]).then(([tree, body]) => {
      setGroups(tree.groups || []);
      setCategories(tree.categories || []);
      setTypes(tree.facilityTypes || []);
      setFacilities(body.place?.facilities || []);
    }).catch(() => setFacilities([]));
  }, [id]);

  const grouped = groups.map((group) => ({
    ...group,
    items: facilities.filter((facility) => {
      const kind = types.find((row) => row.slug === facility.type);
      const category = categories.find((row) => row.code === (facility.category || kind?.category_code));
      return category?.group_code === group.code;
    }),
  })).filter((group) => group.items.length);

  async function suggest(action: "add" | "remove") {
    if (!id || !choice) return;
    setNote("");
    try {
      await plugSend(`/places/${encodeURIComponent(id)}/facility`, "POST", { action, facility: choice });
      setNote(action === "add" ? "Sent for review." : "Removal sent for review.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not send that");
    }
  }

  if (!id || grouped.length === 0 && types.length === 0) return null;
  return (
    <section className="px-gutter-sm py-4 flex flex-col gap-3">
      {grouped.map((group) => (
        <div key={group.code} className="rounded-xl p-3" style={{ background: group.colour }}>
          <h2 className="mb-2 text-sm font-bold">{group.label}</h2>
          <ul className="space-y-1 text-sm">
            {group.items.map((item) => {
              const kind = types.find((row) => row.slug === item.type);
              const on = highlight && highlight === item.type;
              return <li key={item.id || item.type} className={on ? "font-bold underline" : ""}>{item.label || kind?.label || item.type}</li>;
            })}
          </ul>
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <label className="text-sm">
          Suggest a facility
          <select className="mt-1 w-full rounded-lg border px-3 py-2" value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">Choose</option>
            {types.map((row) => <option key={row.slug} value={row.slug}>{row.label}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="button" className="min-h-11 rounded-xl bg-primary px-3 font-bold text-on-primary" onClick={() => suggest("add")}>Add</button>
          <button type="button" className="min-h-11 rounded-xl bg-surface-container-high px-3 font-bold" onClick={() => suggest("remove")}>Remove</button>
        </div>
        {note ? <p className="text-sm">{note}</p> : null}
      </div>
    </section>
  );
}
