// Stitch: dominion-redesign/9783a6e6732d4bbd8a0e0864ff0d949a
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, MinusCircle, RefreshCw, Search } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { DominionEmpty, DominionError, DominionLoading } from "../DominionStates";
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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    if (!token) return;
    setStatus("loading");
    try {
      const [family, platform, engine] = await Promise.all([
        partsEnterpriseApi.familyReview(token),
        partsEnterpriseApi.platforms(token),
        partsEnterpriseApi.engines(token),
      ]);
      setFamilies((Array.isArray(family.items) ? family.items : []) as FamilyRow[]);
      setPlatforms(Array.isArray(platform.items) ? (platform.items as Record<string, unknown>[]) : []);
      setEngines(Array.isArray(engine.items) ? (engine.items as Record<string, unknown>[]) : []);
      setStatus("ready");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not load families");
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

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
        } else if (
          !window.confirm(
            `Mark ${list.map((row) => row.car_name || row.chassis_code).join(", ")} as sharing body parts?`,
          )
        ) {
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

  const groups = useMemo(() => {
    const grouped = new Map<string, FamilyRow[]>();
    for (const row of families) {
      const list = grouped.get(row.group_key) ?? [];
      list.push(row);
      grouped.set(row.group_key, list);
    }
    const needle = query.trim().toLowerCase();
    return [...grouped.entries()].filter(([, list]) => {
      if (!needle) return true;
      const family = (list[0]?.suggested_family || list[0]?.group_key || "").toLowerCase();
      const names = list.map((row) => row.car_name || row.chassis_code).join(" ").toLowerCase();
      return family.includes(needle) || names.includes(needle);
    });
  }, [families, query]);

  function enginesFor(list: FamilyRow[]): string[] {
    const codes = new Set(list.map((row) => row.chassis_code));
    const names = new Set(list.map((row) => (row.car_name || "").toLowerCase()));
    return engines
      .filter((engine) => {
        const chassis = String(engine.chassis_code ?? engine.platform_code ?? "").trim();
        const family = String(engine.family ?? engine.platform ?? "").toLowerCase();
        return (chassis && codes.has(chassis)) || (family && names.has(family));
      })
      .map((engine) => String(engine.code || ""))
      .filter(Boolean);
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] flex-1 p-8 text-slate-900">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-slate-500">
        <span>Dominion</span>
        <span aria-hidden>›</span>
        <span>Master data</span>
        <span aria-hidden>›</span>
        <span>Vehicles</span>
        <span aria-hidden>›</span>
        <span className="font-medium text-slate-900">Platforms and engines</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Platforms and engines</h1>
        <p className="mt-1 text-sm text-slate-600">
          Shared chassis families, and whether those platforms share body parts.
        </p>
      </div>

      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-3.5 w-3.5 text-slate-400" aria-hidden />
          <input
            className="block w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            placeholder="Search families or platforms..."
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          type="button"
          onClick={() => void load()}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Reload
        </button>
      </div>

      {notice ? <p className="mb-3 text-sm text-slate-600">{notice}</p> : null}
      {status === "loading" ? <DominionLoading /> : null}
      {status === "error" ? <DominionError onRetry={() => void load()} /> : null}
      {status === "ready" && groups.length === 0 ? <DominionEmpty /> : null}

      {status === "ready" && groups.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/75">
                  <th className="px-5 py-3 text-xs font-semibold text-slate-700" scope="col">
                    Family
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-700" scope="col">
                    Platforms
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-700" scope="col">
                    Engines
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-700" scope="col">
                    Shares body parts
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map(([key, list]) => {
                  const share = list.some((row) => row.share_body_parts === true);
                  const known = list.some((row) => row.share_body_parts != null);
                  const engineCodes = enginesFor(list);
                  return (
                    <tr key={key} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-5 py-3.5 align-middle font-semibold text-slate-900">
                        {list[0]?.suggested_family || key}
                      </td>
                      <td className="px-5 py-3.5 align-middle text-slate-700">
                        {list.map((row) => row.car_name || row.chassis_code).join(", ")}
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        {engineCodes.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {engineCodes.map((code) => (
                              <span
                                key={code}
                                className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-800"
                              >
                                {code}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <div className="flex flex-wrap items-center gap-2">
                          {known && share ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                              Yes
                            </span>
                          ) : null}
                          {known && !share ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                              <MinusCircle className="h-3.5 w-3.5" aria-hidden />
                              No
                            </span>
                          ) : null}
                          {!known ? <span className="text-slate-400">—</span> : null}
                          <button
                            type="button"
                            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            onClick={() => void decide(list, false)}
                          >
                            Keep separate
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                            onClick={() => void decide(list, true)}
                          >
                            They share body parts
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/50 px-5 py-3.5 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-slate-400" aria-hidden />
              <span>Additional partitions: The data is not in yet.</span>
            </div>
            <div className="font-mono text-[11px] text-slate-400">LOC: KINGSTON / PARISH REGISTRY JMD</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
