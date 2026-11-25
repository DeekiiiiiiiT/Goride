import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PartsButton } from "../../PartsButton";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { CatalogPageDraft, CatalogPartRow, PartTypeRow } from "../addPartsTypes";
import { fetchSelfServePartTypes, lookupSelfServePart, submitPartTypeRequest } from "../addPartsApi";
import { AxleNumberedPositionBlock, PositionChips } from "../Step2FitBlock";
import {
  cataloguePlaceHint,
  catalogueRowBlocker,
  duplicatePartNumberMessage,
  PartTypeIcon,
  plainPlaceLabel,
  savedPartName,
} from "../addPartsShared";
import { AskPartTypePanel } from "../states/AskPartTypePanel";
import { catalystPositionsFor, isOxygenSensorJob } from "@roam/types/partPositions";
import { PartNumberGuidePanel } from "./CatalogHelpBits";
import { D_MUTED, D_TINT, D_TXT, DFooter, DQuestion } from "./dominionKit";

const GUIDE_KEY = "dominion.catalogPartNumberGuide.seen";

function newRow(brand: string): CatalogPartRow {
  return {
    clientId: crypto.randomUUID(),
    partTypeId: "",
    brand,
    partNumber: "",
  };
}

export function CatalogStep3Parts({
  draft,
  setDraft,
  singlePart,
  onNext,
  onBack,
  onEditCars,
}: {
  draft: CatalogPageDraft;
  setDraft: (d: CatalogPageDraft) => void;
  singlePart?: boolean;
  onNext: () => void;
  onBack: () => void;
  onEditCars?: () => void;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [guideOpen, setGuideOpen] = useState(() => {
    try {
      return !window.localStorage.getItem(GUIDE_KEY);
    } catch {
      return true;
    }
  });
  const typesQuery = useQuery({ queryKey: ["self-serve-part-types"], queryFn: fetchSelfServePartTypes });
  const types = typesQuery.data ?? [];

  const brand = draft.brandDefault || draft.catalogCarMaker || "";

  useEffect(() => {
    if (!draft.partRows.length) setDraft({ ...draft, partRows: [newRow(brand)] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.partRows.length]);

  const rows = draft.partRows.length ? draft.partRows : [newRow(brand)];

  function setRows(next: CatalogPartRow[]) {
    setDraft({ ...draft, partRows: next });
  }

  function updateRow(id: string, patch: Partial<CatalogPartRow>) {
    setRows(rows.map((r) => (r.clientId === id ? { ...r, ...patch } : r)));
  }

  function closeGuide() {
    setGuideOpen(false);
    try {
      window.localStorage.setItem(GUIDE_KEY, "1");
    } catch {
      // A blocked storage just means the guide opens again next time.
    }
  }

  function addRow() {
    setRows([...rows, newRow(brand)]);
  }

  function applyPasteLines() {
    const lines = pasteText
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    setRows([...rows, ...lines.map((partNumber) => ({ ...newRow(brand), partNumber }))]);
    setPasteText("");
    setPasteOpen(false);
  }

  function removeRow(id: string) {
    setRows(rows.filter((r) => r.clientId !== id));
  }

  const blockers = rows.map((r) => catalogueRowBlocker(r, types));
  const duplicateMessage = duplicatePartNumberMessage(rows);
  const firstBlocker = blockers.findIndex(Boolean);
  const summary = duplicateMessage
    ?? (firstBlocker >= 0 ? `Part ${firstBlocker + 1} ${blockers[firstBlocker]}.` : "");

  const from = draft.pageYearsFrom ?? null;
  const stillMade = draft.pageYearsStillMade === true;
  const yearsLabel = from == null
    ? "Years not entered yet"
    : stillMade || draft.pageYearsTo == null
      ? `${from} to now`
      : `${from}–${draft.pageYearsTo}`;

  return (
    <div className="flex max-w-[960px] flex-col gap-space-md pb-28 sm:pb-0">
      <p className="catalog-step-mobile-label font-body-sm text-on-surface-variant sm:hidden">Step 3 of 4 · Parts</p>
      <DQuestion
        title={singlePart ? "Add the part from this page" : "Add each part on the page"}
        hint="One card per part number. Copy the number exactly as printed."
      />

      <div className="flex flex-wrap items-center gap-2">
        <PartsButton variant="secondary" onClick={addRow}>
          <MaterialIcon name="add" className="text-[18px]" /> Add another part
        </PartsButton>
        <PartsButton variant="secondary" onClick={() => setPasteOpen((v) => !v)}>
          <MaterialIcon name="content_paste" className="text-[18px]" /> Paste several numbers
        </PartsButton>
      </div>

      {pasteOpen ? (
        <div className="flex flex-col gap-2 rounded-xl bg-[#f3f4fb] p-4 dark:bg-[#0b1220]">
          <label className={`text-[14px] font-semibold ${D_TXT}`} htmlFor="catalog-paste-numbers">
            Paste the part numbers, one per line
          </label>
          <textarea
            id="catalog-paste-numbers"
            className="min-h-[96px] rounded-lg border border-[#c5c6d0] bg-white px-3 py-2 text-[14px] dark:border-[#1e293b] dark:bg-[#111a2e]"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"89467-B1040\n89465-B1120"}
          />
          <div className="flex gap-2">
            <PartsButton variant="secondary" onClick={() => setPasteOpen(false)}>Close</PartsButton>
            <PartsButton variant="primary" onClick={applyPasteLines} disabled={!pasteText.trim()}>
              Add these numbers
            </PartsButton>
          </div>
        </div>
      ) : null}

      {guideOpen ? <PartNumberGuidePanel open onClose={closeGuide} /> : null}

      {typesQuery.isLoading ? (
        <p className={`${D_TINT} p-4 text-[14px] ${D_MUTED}`}>Loading the part types…</p>
      ) : typesQuery.isError ? (
        <p className="rounded-xl border border-[#f3c0bf] bg-[#fdecec] p-4 text-[14px] text-[#a83836]">
          Could not load the part types. Try again, or ask the owner to add the type.
        </p>
      ) : null}

      <div className="flex flex-col gap-space-md">
        {rows.map((row, index) => {
          const type = row.partType ?? types.find((t) => t.id === row.partTypeId) ?? null;
          const scheme = type?.positionScheme ?? "none";
          const oxygen = Boolean(type && isOxygenSensorJob({ opCode: type.opCode }));
          const placeOptions = catalystPositionsFor({ opCode: type?.opCode ?? null });
          const blocker = blockers[index];
          return (
            <article
              key={row.clientId}
              aria-label={`Part ${index + 1}`}
              className="rounded-xl border border-[#e6e7ee] bg-white p-4 dark:border-[#1e293b] dark:bg-[#111a2e]"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className={`text-[16px] font-semibold ${D_TXT}`}>Part {index + 1}</p>
                {rows.length > 1 ? (
                  <PartsButton
                    variant="danger"
                    className="!h-9"
                    aria-label={`Remove part ${index + 1}`}
                    onClick={() => removeRow(row.clientId)}
                  >
                    <MaterialIcon name="delete" className="text-[18px]" /> Remove
                  </PartsButton>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CatalogTypePicker
                  types={types}
                  value={row.partTypeId}
                  openWhenEmpty
                  onChange={(t) => {
                    if (!t) return;
                    updateRow(row.clientId, {
                      partTypeId: t.id,
                      partType: t,
                      position: t.positionScheme === "none" ? "" : row.position,
                      side: t.positionScheme === "none" ? "" : row.side,
                      catalogueNumber: t.positionScheme === "axle_numbered" ? row.catalogueNumber : undefined,
                    });
                  }}
                />
                <div>
                  <label className={`mb-1 block text-[13px] ${D_MUTED}`} htmlFor={`part-number-${row.clientId}`}>
                    Part number
                  </label>
                  <input
                    id={`part-number-${row.clientId}`}
                    aria-label={`Part ${index + 1} part number`}
                    className="h-10 w-full rounded-lg border border-[#c5c6d0] bg-white px-3 text-[14px] dark:border-[#1e293b] dark:bg-[#0b1220]"
                    placeholder="e.g. 89467-B1040"
                    value={row.partNumber}
                    onChange={(e) => updateRow(row.clientId, { partNumber: e.target.value })}
                  />
                  <p className={`mt-1 text-[12px] ${D_MUTED}`}>Copy it exactly as printed.</p>
                  <ExistingOnFileHint
                    brand={row.brand || brand}
                    number={row.partNumber}
                    onExisting={(id) => updateRow(row.clientId, { existingPartId: id })}
                  />
                </div>
              </div>

              <div className="mt-4">
                <p className={`mb-2 text-[13px] ${D_MUTED}`}>Where on the car?</p>
                {scheme === "before_after_catalyst" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {placeOptions.map((p) => {
                      const on = row.position === p.id;
                      const label = oxygen
                        ? (p.id === "before_cat" ? "Front (before converter)" : "Rear (after converter)")
                        : p.label;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`min-h-[44px] rounded-lg px-3 text-[14px] font-medium ${
                            on
                              ? "bg-[#0153dc] text-white"
                              : "border border-[#c5c6d0] bg-white text-[#30323b] dark:border-[#1e293b] dark:bg-[#0b1220] dark:text-[#e2e8f0]"
                          }`}
                          aria-pressed={on}
                          onClick={() => updateRow(row.clientId, { position: on ? "" : p.id, side: "" })}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : scheme === "axle_numbered" ? (
                  <AxleNumberedPositionBlock
                    position={row.position ?? ""}
                    side={row.side ?? ""}
                    catalogueNumber={row.catalogueNumber}
                    onPosition={(pos) => updateRow(row.clientId, { position: pos })}
                    onSide={(side) => updateRow(row.clientId, { side })}
                    onCatalogue={(n) =>
                      updateRow(row.clientId, { catalogueNumber: n, side: "" })
                    }
                  />
                ) : (
                  <PositionChips
                    scheme={scheme}
                    position={row.position ?? ""}
                    side={row.side ?? ""}
                    opCode={type?.opCode ?? null}
                    onPick={(pos, side) => updateRow(row.clientId, { position: pos, side })}
                  />
                )}
                {cataloguePlaceHint(type) ? (
                  <p className={`mt-2 text-[12px] ${D_MUTED}`}>{cataloguePlaceHint(type)}</p>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
                <span className={D_MUTED}>Years on the page:</span>
                <span className={`font-medium ${D_TXT}`}>{yearsLabel}</span>
                {onEditCars ? (
                  <PartsButton variant="secondary" className="!h-8 !px-3 text-[13px]" onClick={onEditCars}>
                    Change
                  </PartsButton>
                ) : null}
              </div>

              <p className={`mt-2 text-[13px] ${D_MUTED}`}>
                Saves as:{" "}
                <span className={`font-medium ${D_TXT}`} data-testid={`saves-as-${index}`}>
                  {[plainPlaceLabel(row.position, row.side, row.catalogueNumber), savedPartName(type, row)]
                    .filter(Boolean)
                    .join(" · ") || "choose the type and place"}
                </span>
              </p>

              {blocker ? (
                <p className="mt-2 text-[13px] text-[#8a5a00] dark:text-[#fbbf24]">
                  Part {index + 1} {blocker}.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="mt-2">
        <AskPartTypePanel
          onSubmit={async (p) => {
            await submitPartTypeRequest(p);
            toast.success("Request sent — the owner will review it in Part types.");
          }}
        />
      </div>

      {summary ? <p className="text-[14px] font-medium text-error">{summary}</p> : null}

      <DFooter
        left={
          <PartsButton variant="secondary" onClick={onBack}>
            <MaterialIcon name="arrow_back" className="text-[18px]" /> Back: the cars
          </PartsButton>
        }
        right={
          <PartsButton variant="primary" onClick={onNext} disabled={Boolean(summary)}>
            Next: check and save <MaterialIcon name="arrow_forward" className="text-[18px]" />
          </PartsButton>
        }
      />
    </div>
  );
}

/** The type list, drawn inside the card: search, a count, a shortlist, and the full list (plan §4 Step 3). */
function CatalogTypePicker({
  types,
  value,
  onChange,
  openWhenEmpty,
}: {
  types: PartTypeRow[];
  value: string;
  onChange: (t: PartTypeRow | null) => void;
  openWhenEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = types.find((t) => t.id === value) ?? null;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return types;
    return types.filter(
      (t) =>
        t.name.toLowerCase().includes(needle)
        || (t.opCode ?? "").toLowerCase().includes(needle)
        || (t.tradeTerm ?? "").toLowerCase().includes(needle),
    );
  }, [q, types]);

  useEffect(() => {
    if (openWhenEmpty && !value) setOpen(true);
  }, [openWhenEmpty, value]);

  return (
    <div>
      <span className={`mb-1 block text-[13px] ${D_MUTED}`}>Part type</span>
      <button
        type="button"
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-[#c5c6d0] bg-white px-3 text-left text-[14px] dark:border-[#1e293b] dark:bg-[#0b1220]"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Part type"
      >
        {selected ? (
          <>
            <PartTypeIcon iconKey={selected.iconKey} className="text-[18px] text-[#0153dc]" />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className={D_MUTED}>Choose type…</span>
        )}
        <MaterialIcon name={open ? "expand_less" : "expand_more"} className="ml-auto text-[20px] text-[#5d5f68]" />
      </button>
      {open ? (
        <div className="relative z-20 mt-1 w-full rounded-xl border border-[#e6e7ee] bg-white p-2 shadow-lg dark:border-[#1e293b] dark:bg-[#111a2e]">
          <input
            aria-label="Search part types"
            className="mb-2 h-9 w-full rounded-lg border border-[#c5c6d0] px-3 text-[14px] dark:border-[#1e293b] dark:bg-[#0b1220]"
            placeholder="Search types…"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
          <p className={`mb-1 text-[12px] ${D_MUTED}`}>{filtered.length} types</p>
          <ul className="max-h-64 overflow-y-auto">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2 text-left text-[14px] hover:bg-[#f3f4fb] dark:hover:bg-[#0b1220]"
                  onClick={() => {
                    onChange(t);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <PartTypeIcon iconKey={t.iconKey} className="text-[18px] text-[#0153dc]" />
                  <span>{t.name}</span>
                  {t.tradeTerm && t.tradeTerm !== t.name ? (
                    <span className={`ml-auto text-[12px] ${D_MUTED}`}>{t.tradeTerm}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {filtered.length === 0 ? (
            <p className={`p-2 text-[13px] ${D_MUTED}`}>No type matches that word. Ask for it below.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ExistingOnFileHint({
  brand,
  number,
  onExisting,
}: {
  brand: string;
  number: string;
  onExisting: (id: string) => void;
}) {
  const q = useQuery({
    queryKey: ["lookup", brand, number],
    queryFn: () => lookupSelfServePart(brand, number),
    enabled: brand.trim().length > 0 && number.trim().length > 4,
  });
  useEffect(() => {
    if (q.data?.found && q.data.partId) onExisting(q.data.partId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.found, q.data?.partId]);
  if (!q.data?.found) return null;
  return (
    <p className="mt-1 text-[13px] text-[#0153dc] dark:text-[#5b8def]">
      Already on file
      {q.data.listingCount ? ` · on ${q.data.listingCount} cars` : ""} — we&apos;ll add these cars to it.
    </p>
  );
}
