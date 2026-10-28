import { useEffect, useState } from "react";
import { AttributeFields } from "./AttributeFields";
import { placesSend, type PlacesStates, type Taxonomy } from "./placesApi";

export function PlaceCategories({
  apiBase,
  getToken,
  states,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  states: PlacesStates;
}) {
  const { Loading, Empty, Error } = states;
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [preview, setPreview] = useState<Taxonomy["placeTypes"][number] | null>(null);

  const load = () => {
    setStatus("loading");
    placesSend<Taxonomy>(apiBase, getToken, "/admin/taxonomy").then((tree) => {
      setTaxonomy(tree);
      setStatus("ready");
    }).catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, []);

  async function retire(table: string, id: string) {
    await placesSend(apiBase, getToken, `/admin/taxonomy/${table}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ retire: true }),
    });
    load();
  }

  if (status === "loading") return <Loading />;
  if (status === "error" || !taxonomy) return <Error onRetry={load} />;
  if (!taxonomy.placeTypes.length) return <Empty body="No place types are loaded." />;

  return (
    <div className="space-y-6 p-4">
      <h2 className="text-lg font-semibold">Categories</h2>
      <section>
        <h3 className="mb-2 font-medium">Groups</h3>
        <ul className="space-y-1 text-sm">
          {taxonomy.groups.map((row) => (
            <li key={row.code} className="flex items-center justify-between rounded-lg px-2 py-1" style={{ background: row.colour }}>
              <span>{row.label}</span>
              <button type="button" className="text-xs underline" onClick={() => retire("category_group", row.code)}>Retire</button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 font-medium">Categories</h3>
        <ul className="space-y-1 text-sm">
          {taxonomy.categories.map((row) => (
            <li key={row.code} className="flex items-center justify-between">
              <span>{row.label}</span>
              <button type="button" className="text-xs underline" onClick={() => retire("category", row.code)}>Retire</button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 font-medium">Place types</h3>
        <ul className="space-y-1 text-sm">
          {taxonomy.placeTypes.map((row) => (
            <li key={row.slug} className="flex items-center justify-between gap-2">
              <button type="button" className="underline" onClick={() => setPreview(row)}>{row.label}</button>
              <button type="button" className="text-xs underline" onClick={() => retire("place_type", row.slug)}>Retire</button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 font-medium">Facility types</h3>
        <ul className="space-y-1 text-sm">
          {taxonomy.facilityTypes.map((row) => (
            <li key={row.slug} className="flex items-center justify-between">
              <span>{row.label}</span>
              <button type="button" className="text-xs underline" onClick={() => retire("facility_type", row.slug)}>Retire</button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 font-medium">Brands</h3>
        <ul className="space-y-1 text-sm">
          {taxonomy.brands.map((row) => (
            <li key={row.id} className="flex items-center justify-between">
              <span>{row.name}</span>
              <button type="button" className="text-xs underline" onClick={() => retire("brand", row.id)}>Retire</button>
            </li>
          ))}
        </ul>
      </section>
      {preview && (
        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-2 font-medium">Form preview · {preview.label}</h3>
          <AttributeFields schema={preview.attribute_schema} value={{}} onChange={() => {}} />
          <p className="mt-2 text-xs text-slate-500">The fields above are the ones this type stores. Drive-through is a facility. A 24 hour place is stored as hours.</p>
        </section>
      )}
    </div>
  );
}
