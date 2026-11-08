import { useMemo, useState } from "react";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { PartsButton } from "../../parts-database/PartsButton";
import { MakerLogo } from "../MakerLogo";
import { EditMakerDialog } from "../EditMakerDialog";
import type { CatalogMakerSummary } from "../vehiclesCatalogApi";
import type { ModelAgg } from "./vehiclesStitchShared";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DIcon, DPill } from "../../parts-database/add-parts/catalog/dominionKit";

const PAGE_SIZE = 12;

type Props = {
  make: string;
  summary: CatalogMakerSummary | undefined;
  models: ModelAgg[];
  items: VehicleCatalogRecord[];
  logoPath?: string | null;
  onBack: () => void;
  onOpenModel: (model: string) => void;
  onAddCar: () => void;
};

export function VehiclesMakerScreen({
  make,
  summary,
  models,
  logoPath,
  onBack,
  onOpenModel,
  onAddCar,
}: Props) {
  const [makerEditOpen, setMakerEditOpen] = useState(false);
  const [sort, setSort] = useState<"name" | "years">("name");
  const [modelQ, setModelQ] = useState("");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    let list = [...models];
    if (modelQ.trim()) {
      const q = modelQ.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.yearMax - a.yearMax));
    return list;
  }, [models, modelQ, sort]);

  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  return (
    <div className="vehicles-database-stitch parts-database-stitch flex flex-col gap-5 px-margin py-space-lg">
      <PartsButton variant="secondary" className="self-start" onClick={onBack}>
        <DIcon name="arrow_back" className="text-[18px]" /> Back
      </PartsButton>
      <div className={`${D_CARD} flex flex-wrap items-center gap-5 p-6`}>
        <MakerLogo make={make} logoStoragePath={logoPath} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className={`text-[28px] font-semibold tracking-tight ${D_TXT}`}>{make}</h1>
          <p className={`text-[15px] ${D_MONO} ${D_MUTED}`}>
            {summary?.version_count ?? models.reduce((n, x) => n + x.versions.length, 0)} versions ·{" "}
            {summary?.model_count ?? models.length} models
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <PartsButton variant="secondary" onClick={() => setMakerEditOpen(true)}>
            <DIcon name="edit" className="text-[18px]" /> Edit maker
          </PartsButton>
          <PartsButton variant="primary" onClick={onAddCar}>
            <DIcon name="add" className="text-[18px]" /> Add a car
          </PartsButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <DIcon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-[#5d5f68]" />
          <input
            className="h-11 w-full rounded-xl border border-[#e6e7ee] bg-white pl-10 pr-3 text-[14px] dark:border-[#1e293b] dark:bg-[#111a2e]"
            placeholder={`Search ${make} models`}
            value={modelQ}
            onChange={(e) => {
              setModelQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <PartsButton variant={sort === "name" ? "primary" : "secondary"} onClick={() => setSort("name")}>A–Z</PartsButton>
        <PartsButton variant={sort === "years" ? "primary" : "secondary"} onClick={() => setSort("years")}>Newest first</PartsButton>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pageItems.map((m) => (
          <button
            key={m.name}
            type="button"
            className={`${D_CARD} group flex min-h-[140px] flex-col gap-1 p-5 text-left transition-colors hover:border-[#0153dc]`}
            onClick={() => onOpenModel(m.name)}
          >
            <span className="flex items-start justify-between gap-2">
              <span className={`text-[20px] font-semibold ${D_TXT}`}>{m.name}</span>
              <DIcon name="arrow_forward" className="text-[18px] text-[#5d5f68] group-hover:text-[#0153dc]" />
            </span>
            <span className={`text-[14px] ${D_MUTED}`}>
              {m.yearMin} – {m.yearMax >= 9999 ? "today" : m.yearMax}
            </span>
            <span className="mt-auto pt-3">
              <DPill tone="grey">{m.versions.length} version{m.versions.length === 1 ? "" : "s"}</DPill>
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-[14px] ${D_MUTED}`}>Showing {pageItems.length} of {sorted.length}</p>
        {pageCount > 1 ? (
          <div className="flex gap-2">
            <PartsButton variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <DIcon name="chevron_left" className="text-[18px]" /> Previous
            </PartsButton>
            <PartsButton variant="secondary" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
              Next <DIcon name="chevron_right" className="text-[18px]" />
            </PartsButton>
          </div>
        ) : null}
      </div>
      <EditMakerDialog make={make} country={summary?.country} open={makerEditOpen} onOpenChange={setMakerEditOpen} />
    </div>
  );
}
