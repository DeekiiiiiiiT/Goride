import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../ui/button";
import { partsEnterpriseApi } from "../../../services/partSourcingService";

type FamilyRow = {
  chassis_code: string;
  group_key: string;
  suggested_family: string;
  car_name: string;
  share_body_parts: boolean | null;
  notes?: string;
};

export function PlatformsEnginesPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [families, setFamilies] = useState<FamilyRow[]>([]);
  const [platforms, setPlatforms] = useState<Record<string, unknown>[]>([]);
  const [engines, setEngines] = useState<Record<string, unknown>[]>([]);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    const [family, platform, engine] = await Promise.all([
      partsEnterpriseApi.familyReview(token),
      partsEnterpriseApi.platforms(token),
      partsEnterpriseApi.engines(token),
    ]);
    setFamilies((Array.isArray(family.items) ? family.items : []) as FamilyRow[]);
    setPlatforms(Array.isArray(platform.items) ? platform.items as Record<string, unknown>[] : []);
    setEngines(Array.isArray(engine.items) ? engine.items as Record<string, unknown>[] : []);
  }, [token]);

  useEffect(() => { void load().catch((err) => setNotice(err instanceof Error ? err.message : "Could not load families")); }, [load]);

  async function decide(list: FamilyRow[], share: boolean) {
    if (!token) return;
    const target = list[0]?.suggested_family || list[0]?.group_key || "";
    try {
      if (share) {
        const blast = platforms.find((item) => String(item.code) === target);
        if (blast?.id) {
          const radius = await partsEnterpriseApi.blast(token, "platform", String(blast.id));
          const vehicles = `${radius.variantCount} vehicle${radius.variantCount === 1 ? "" : "s"}`;
          const makes = `${radius.makeCount} make${radius.makeCount === 1 ? "" : "s"}`;
          const ok = window.confirm(`This applies to ${vehicles} across ${makes}.`);
          if (!ok) return;
        } else if (!window.confirm(`Mark ${list.map((row) => row.car_name || row.chassis_code).join(", ")} as sharing body parts?`)) {
          return;
        }
      }
      await partsEnterpriseApi.setFamily(token, {
        family: target,
        chassisCodes: list.map((row) => row.chassis_code),
        shareBodyParts: share,
      });
      setNotice(share ? `${target} now shares body parts.` : `${target} stays separate.`);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update this family");
    }
  }

  const groups = new Map<string, FamilyRow[]>();
  for (const row of families) {
    const list = groups.get(row.group_key) ?? [];
    list.push(row);
    groups.set(row.group_key, list);
  }

  return (
    <div className="p-4 md:p-6 space-y-6 text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-xl font-bold">Platforms & Engines</h1>
        <p className="text-sm text-slate-500">Group chassis that share body parts. Engines stay separate from the body family.</p>
      </div>
      {notice ? <p className="text-sm">{notice}</p> : null}
      <div className="space-y-3">
        {[...groups.entries()].map(([key, list]) => (
          <div key={key} className="border rounded-lg p-3 space-y-2">
            <p className="font-medium">{list[0]?.suggested_family || key}</p>
            <p className="text-sm text-slate-500">{list.map((row) => row.car_name || row.chassis_code).join(", ")}</p>
            {list.some((row) => row.notes) ? <p className="text-sm">{list.map((row) => row.notes).filter(Boolean).join(" ")}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void decide(list, false)}>Keep separate</Button>
              <Button type="button" size="sm" onClick={() => void decide(list, true)}>They share body parts</Button>
            </div>
          </div>
        ))}
      </div>
      <div>
        <h2 className="font-semibold mb-2">Engines ({engines.length})</h2>
        <ul className="text-sm space-y-1 max-h-64 overflow-auto">
          {engines.slice(0, 80).map((engine) => <li key={String(engine.id)}>{String(engine.code)}</li>)}
        </ul>
      </div>
    </div>
  );
}
