import React, { useState } from "react";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { partsEnterpriseApi } from "../../../services/partSourcingService";
import { VariantPartsChecklist } from "./VariantPartsChecklist";
import { UniversalItemsPanel } from "./UniversalItemsPanel";

type Hit = {
  id: string;
  make: string;
  model: string;
  chassis_code?: string | null;
  engine_code?: string | null;
  production_start_year?: number | null;
  production_end_year?: number | null;
};

export function PartsCatalogHome({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Find a vehicle</h2>
        <p className="text-sm text-slate-500">Open its parts checklist. You do not need to create a group or a rule.</p>
      </div>
      <div className="flex gap-2">
        <Input value={query} placeholder="Make, model, or chassis" onChange={(e) => setQuery(e.target.value)} />
        <Button type="button" variant="outline" onClick={() => {
          void partsEnterpriseApi.catalogVariants(token, query.trim()).then((data) => {
            setHits(Array.isArray(data.items) ? data.items as Hit[] : []);
          }).catch(() => setHits([]));
        }}>Search</Button>
      </div>
      {hits.length > 0 && !picked ? (
        <ul className="text-sm divide-y rounded-lg border">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-amber-500/10" onClick={() => setPicked(hit)}>
                {hit.make} {hit.model} · {hit.chassis_code || "No chassis"} · {hit.engine_code || "No engine"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {picked ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{picked.make} {picked.model}</h3>
            <Button type="button" size="sm" variant="outline" onClick={() => setPicked(null)}>Choose another vehicle</Button>
          </div>
          <VariantPartsChecklist
            token={token}
            variant={{
              id: picked.id,
              label: `${picked.make} ${picked.model}`,
              yearFrom: picked.production_start_year,
              yearTo: picked.production_end_year,
            }}
          />
        </div>
      ) : null}
      <UniversalItemsPanel token={token} />
    </div>
  );
}
