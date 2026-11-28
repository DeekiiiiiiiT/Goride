import { useCallback, useEffect, useState } from "react";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import type { MaintenanceRule } from "../maintenanceMasterApi";
import { CheckNumbersPage } from "./CheckNumbersPage";
import { ManualModelPage } from "./ManualModelPage";
import { listModelFamilies, marketLabel, type ModelFamilyRow } from "./manualsApi";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, Icon, Pill } from "./manualsUi";
import { UploadManualDialog } from "./UploadManualDialog";

type View = { kind: "list" } | { kind: "model"; platformId: string } | { kind: "check"; platformId: string; manualId: string; modelName: string };

type Props = {
  token: string;
  catalog: VehicleCatalogRecord[];
  rules: MaintenanceRule[];
  categories: MaintenanceServiceCategory[];
  canEdit: boolean;
  canApprove: boolean;
  /** Ask from elsewhere (the schedule drawer) to upload for one model. */
  uploadRequest?: { platformId: string; name: string; at: number } | null;
  onCountChanged: (modelsWithManual: number) => void;
  onRulesChanged: () => void;
};

function manualChip(m: ModelFamilyRow["manuals"][number]) {
  const mk = marketLabel(m.market).label;
  if (m.status === "checked") return <Pill tone="green">{`${mk} · checked`}</Pill>;
  if (m.status === "waiting_check") return <Pill tone="amber">{`${mk} · waiting for you`}</Pill>;
  if (m.status === "reading") return <Pill tone="blue">{`${mk} · reading`}</Pill>;
  if (m.status === "rejected") return <Pill tone="red">{`${mk} · rejected`}</Pill>;
  return <Pill tone="slate">{`${mk} · stopped`}</Pill>;
}

export function ManualsTab({
  token,
  catalog,
  rules,
  categories,
  canEdit,
  canApprove,
  uploadRequest,
  onCountChanged,
  onRulesChanged,
}: Props) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [has, setHas] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ModelFamilyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [withManual, setWithManual] = useState<ModelFamilyRow[]>([]);
  const [withoutCount, setWithoutCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<{ platformId: string; name: string } | null | "free">(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadCounts = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        listModelFamilies(token, { hasManual: "true" }),
        listModelFamilies(token, { hasManual: "false" }),
      ]);
      setWithManual(a.items);
      setWithoutCount(b.total);
      onCountChanged(a.total);
    } catch {
      /* the list below shows the error */
    }
  }, [token, onCountChanged]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      // With no search, models that have a manual come first so the work in progress is on top.
      const res = await listModelFamilies(token, { q: query, hasManual: has || (query ? "" : "true"), page });
      if (!query && !has && res.total === 0) {
        const all = await listModelFamilies(token, { page });
        setItems(all.items);
        setTotal(all.total);
        setPageSize(all.page_size);
      } else {
        setItems(res.items);
        setTotal(res.total);
        setPageSize(res.page_size);
      }
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "The models could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [token, query, has, page]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts, refreshKey]);
  useEffect(() => {
    void loadList();
  }, [loadList, refreshKey]);

  useEffect(() => {
    if (!uploadRequest) return;
    let live = true;
    void listModelFamilies(token, { platformId: uploadRequest.platformId })
      .then((r) => r.items[0]?.name ?? r.items[0]?.label ?? uploadRequest.name)
      .catch(() => uploadRequest.name)
      .then((name) => live && setUpload({ platformId: uploadRequest.platformId, name }));
    return () => {
      live = false;
    };
  }, [uploadRequest, token]);

  const changed = () => {
    setRefreshKey((k) => k + 1);
    onRulesChanged();
  };

  const waiting = withManual.reduce(
    (n, f) => n + f.manuals.filter((m) => m.status === "reading" || m.status === "waiting_check").length,
    0,
  );
  const waitingCheck = withManual.reduce((n, f) => n + f.manuals.filter((m) => m.status === "waiting_check").length, 0);
  const nothingYet = !loading && withManual.length === 0 && !query && !has;

  const dialog = (
    <UploadManualDialog
      open={upload !== null}
      token={token}
      catalog={catalog}
      preset={upload && upload !== "free" ? upload : null}
      onClose={() => setUpload(null)}
      onUploaded={(_id, platformId) => {
        setUpload(null);
        setView({ kind: "model", platformId });
        changed();
      }}
    />
  );

  if (view.kind === "check") {
    return (
      <>
        <CheckNumbersPage
          token={token}
          manualId={view.manualId}
          modelName={view.modelName}
          categories={categories}
          canApprove={canApprove}
          canEdit={canEdit}
          onBack={() => setView({ kind: "model", platformId: view.platformId })}
          onChanged={changed}
        />
        {dialog}
      </>
    );
  }

  if (view.kind === "model") {
    return (
      <>
        <ManualModelPage
          token={token}
          platformId={view.platformId}
          rules={rules}
          categories={categories}
          canEdit={canEdit}
          canApprove={canApprove}
          refreshKey={refreshKey}
          onBack={() => setView({ kind: "list" })}
          onOpenCheck={(manualId, modelName) => setView({ kind: "check", platformId: view.platformId, manualId, modelName })}
          onUpload={(platformId, name) => setUpload({ platformId, name })}
          onChanged={changed}
        />
        {dialog}
      </>
    );
  }

  if (nothingYet) {
    return (
      <div className="mt-6 space-y-6" data-testid="mm-manuals-empty">
        <p className="flex items-center gap-2 rounded-2xl bg-[#dbe1ff] px-4 py-3 text-[15px] text-[#0047c0]">
          <Icon name="menu_book" className="text-[20px]" />
          The owner's manual is the main source. Upload it once per car model, and every car of that model uses it.
        </p>
        <section className={`${CARD} flex flex-col items-center px-6 py-12 text-center`}>
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#dbe1ff]">
            <Icon name="menu_book" className="text-[36px] text-[#0153dc]" />
          </span>
          <h3 className="mt-4 text-[22px] font-semibold">No owner's manuals yet</h3>
          <p className="mt-1 text-[15px] text-[#5d5f68]">Every car uses Roam policy until you upload its owner's manual.</p>
          {canEdit ? (
            <button type="button" className={`${BTN_PRIMARY} mt-6`} onClick={() => setUpload("free")}>
              <Icon name="upload_file" className="text-[20px]" />
              Upload a manual
            </button>
          ) : null}
        </section>
        <div className="grid gap-4 md:grid-cols-3">
          {["Pick the car", "Upload the PDF and say which pages", "Check the numbers and approve"].map((t, i) => (
            <div key={t} className={`${CARD} flex items-center gap-3 p-5`}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dbe1ff] text-[14px] font-semibold text-[#0153dc]">
                {i + 1}
              </span>
              <span className="text-[15px] font-medium">{t}</span>
            </div>
          ))}
        </div>
        {dialog}
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mt-6 space-y-6 text-[#30323b]" data-testid="mm-manuals-tab">
      <p className="flex items-center gap-2 rounded-2xl bg-[#dbe1ff] px-4 py-3 text-[15px] text-[#0047c0]">
        <Icon name="menu_book" className="text-[20px]" />
        The owner's manual is the main source. Upload it once per car model, and every car of that model uses it.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <div className={`${CARD} p-5`}>
          <p className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-wide text-[#5d5f68]">
            Models with a manual <Icon name="check_circle" className="text-[20px] text-[#006e31]" />
          </p>
          <p className="mt-2 font-mono text-[34px] font-semibold">{withManual.length}</p>
          <p className="truncate text-[14px] text-[#5d5f68]">
            {withManual.slice(0, 2).map((f) => f.name ?? f.label).join(", ") || "None yet"}
          </p>
        </div>
        <div className={`${CARD} p-5`}>
          <p className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-wide text-[#5d5f68]">
            Manuals being read or checked <Icon name="hourglass_top" className="text-[20px] text-[#0153dc]" />
          </p>
          <p className="mt-2 font-mono text-[34px] font-semibold">{waiting}</p>
          <p className="text-[14px] text-[#5d5f68]">{waitingCheck} waiting for you to check</p>
        </div>
        <div className={`${CARD} p-5`}>
          <p className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-wide text-[#5d5f68]">
            Models on Roam policy <Icon name="shield" className="text-[20px] text-[#475569]" />
          </p>
          <p className="mt-2 font-mono text-[34px] font-semibold">{withoutCount.toLocaleString("en-US")}</p>
          <p className="text-[14px] text-[#5d5f68]">No manual yet. Roam's own rule is used.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form
          className="relative min-w-[260px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
        >
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-[#5d5f68]" />
          <input
            className="h-11 w-full rounded-[10px] border border-[#c5c6d0] bg-white pl-10 pr-3 text-[15px]"
            placeholder="Search a make or model…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => {
              if (q.trim() !== query) {
                setPage(1);
                setQuery(q.trim());
              }
            }}
            aria-label="Search a make or model"
          />
        </form>
        <select
          className="h-11 rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[15px]"
          value={has}
          onChange={(e) => {
            setPage(1);
            setHas(e.target.value as "" | "true" | "false");
          }}
          aria-label="Manual"
        >
          <option value="">Manual · All</option>
          <option value="true">Has a manual</option>
          <option value="false">No manual yet</option>
        </select>
        {canEdit ? (
          <button type="button" className={`${BTN_PRIMARY} ml-auto`} onClick={() => setUpload("free")}>
            <Icon name="add" className="text-[20px]" />
            Upload a manual
          </button>
        ) : null}
      </div>

      {error ? <p className="rounded-[10px] bg-[#fdecec] px-3 py-2 text-[14px] text-[#a83836]">{error}</p> : null}
      {!query && !has && withManual.length ? (
        <p className="text-[13px] text-[#5d5f68]">Showing the models that have a manual. Search to find any other model.</p>
      ) : null}

      {loading ? (
        <p className="text-[14px] text-[#5d5f68]">Loading models…</p>
      ) : items.length === 0 ? (
        <div className={`${CARD} p-6 text-[15px] text-[#5d5f68]`}>No model matches that. Try the make or the model name.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((f) => {
            const hasAny = f.manuals.length > 0;
            const checked = f.manuals.some((m) => m.status === "checked");
            const name = f.name ?? f.label ?? f.code;
            return (
              <li key={f.platform_id} className={`${CARD} flex flex-wrap items-center gap-4 p-4`} data-testid="mm-model-row">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc]">
                  <Icon name="directions_car" className="text-[22px]" />
                </span>
                <div className="min-w-[240px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[17px] font-semibold">{name}</p>
                    {checked ? (
                      <Pill tone="green" icon="menu_book">
                        Car maker
                      </Pill>
                    ) : (
                      <Pill tone="slate" icon="shield">
                        Roam policy
                      </Pill>
                    )}
                  </div>
                  {hasAny ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-[#5d5f68]">
                      {f.manuals.length} manual{f.manuals.length === 1 ? "" : "s"}
                      {f.manuals.map((m) => (
                        <span key={m.id}>{manualChip(m)}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[14px] text-[#5d5f68]">
                      No manual for this model yet{f.also_sold_as.length ? ` · also sold as ${f.also_sold_as.join(", ")}` : ""}
                    </p>
                  )}
                </div>
                {hasAny ? (
                  <button type="button" className={BTN_SECONDARY} onClick={() => setView({ kind: "model", platformId: f.platform_id })}>
                    Open
                  </button>
                ) : canEdit ? (
                  <button type="button" className={BTN_SECONDARY} onClick={() => setUpload({ platformId: f.platform_id, name })}>
                    <Icon name="add" className="text-[18px]" />
                    Upload a manual
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[14px] text-[#5d5f68]">
          Showing {items.length} of {total.toLocaleString("en-US")} models
        </p>
        <div className="flex gap-2">
          <button type="button" className={BTN_SECONDARY} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <Icon name="chevron_left" className="text-[18px]" />
            Previous
          </button>
          <button type="button" className={BTN_SECONDARY} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
            <Icon name="chevron_right" className="text-[18px]" />
          </button>
        </div>
      </div>
      {dialog}
    </div>
  );
}
