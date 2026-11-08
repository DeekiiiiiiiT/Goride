import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PartsButton } from "../../PartsButton";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { CatalogPageDraft, CatalogPartRow, PartTypeRow } from "../addPartsTypes";
import { fetchSelfServePartTypes, lookupSelfServePart, submitPartTypeRequest } from "../addPartsApi";
import { AxleNumberedPositionBlock, PositionChips } from "../Step2FitBlock";
import { defaultPartNamePreview } from "../addPartsShared";
import { AskPartTypePanel } from "../states/AskPartTypePanel";
import { WhereOnCarHelpPopover } from "./CatalogHelpBits";
import { CatalogPartTypeSelect } from "./CatalogPartTypeSelect";
import { DFooter, DQuestion } from "./dominionKit";

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
  const [askTypeOpen, setAskTypeOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const typesQuery = useQuery({ queryKey: ["self-serve-part-types"], queryFn: fetchSelfServePartTypes });

  useEffect(() => {
    if (!draft.partRows.length) {
      setDraft({
        ...draft,
        partRows: [newRow(draft.brandDefault || draft.catalogCarMaker || "Toyota")],
      });
    }
  }, [draft, setDraft]);

  const rows = draft.partRows.length ? draft.partRows : [newRow(draft.brandDefault || draft.catalogCarMaker || "Toyota")];

  function setRows(next: CatalogPartRow[]) {
    setDraft({ ...draft, partRows: next });
  }

  function updateRow(id: string, patch: Partial<CatalogPartRow>) {
    setRows(rows.map((r) => (r.clientId === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows([...rows, newRow(draft.brandDefault || draft.catalogCarMaker || "")]);
  }

  function applyPasteLines() {
    const lines = pasteText
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    const brand = draft.brandDefault || draft.catalogCarMaker || "Toyota";
    setRows([...rows, ...lines.map((partNumber) => ({ ...newRow(brand), partNumber }))]);
    setPasteText("");
    setPasteOpen(false);
  }

  function removeRow(id: string) {
    setRows(rows.filter((r) => r.clientId !== id));
  }

  const dupes = useMemo(() => {
    const m = new Map<string, number>();
    const out = new Map<string, number>();
    rows.forEach((r, i) => {
      const k = r.partNumber.trim().toUpperCase();
      if (!k) return;
      if (m.has(k)) {
        out.set(k, m.get(k)!);
        out.set(`${k}#${i}`, i);
      } else m.set(k, i);
    });
    return out;
  }, [rows]);

  const carCount = draft.vehicleListings.length;

  return (
    <div className="flex flex-col gap-space-md max-w-[960px] pb-28 sm:pb-0">
      <p className="catalog-step-mobile-label font-body-sm text-on-surface-variant sm:hidden">Step 3 of 4 · Parts</p>
      <DQuestion
        title={singlePart ? "Add the part from this page" : "Add each part on the page"}
        hint="One row per part number. Copy the number exactly as printed."
        actions={
          <PartsButton variant="primary" className="hidden sm:inline-flex" onClick={onNext}>
            Next: review <MaterialIcon name="arrow_forward" className="text-[18px]" />
          </PartsButton>
        }
      />

      <div className="overflow-x-auto catalog-parts-table -mx-5 sm:-mx-8">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="text-left text-[13px] font-semibold text-[#5d5f68] bg-[#f3f4fb] dark:bg-[#0b1220] dark:text-[#94a3b8]">
              <th className="py-3 pl-5 sm:pl-8 pr-3">Part type</th>
              <th className="py-3 pr-3">Part number</th>
              <th className="py-3 pr-3 min-w-[220px]">
                <span className="inline-flex items-center gap-1">
                  Where on the car
                  <WhereOnCarHelpPopover />
                </span>
              </th>
              <th className="py-3 pr-3 min-w-[170px]">Years</th>
              <th className="py-3 pr-5 sm:pr-8 w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <PartRowEditor
                key={row.clientId}
                row={row}
                rowIndex={idx}
                types={typesQuery.data ?? []}
                dupe={dupes.has(row.partNumber.trim().toUpperCase())}
                onChange={(p) => updateRow(row.clientId, p)}
                onRemove={() => removeRow(row.clientId)}
                onEditCars={onEditCars}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="catalog-parts-mobile-stack flex flex-col gap-3 sm:hidden">
        {rows.map((row, idx) => (
          <MobilePartCard
            key={row.clientId}
            row={row}
            rowIndex={idx}
            types={typesQuery.data ?? []}
            dupe={dupes.has(row.partNumber.trim().toUpperCase())}
            brandDefault={draft.brandDefault || draft.catalogCarMaker || "Toyota"}
            onChange={(p) => updateRow(row.clientId, p)}
            onRemove={() => removeRow(row.clientId)}
          />
        ))}
        {!singlePart ? (
          <PartsButton variant="secondary" className="w-full" onClick={addRow}>
            + Add another part
          </PartsButton>
        ) : null}
      </div>

      {!singlePart ? (
        <div className="hidden sm:flex flex-wrap gap-2 pt-2">
          <PartsButton variant="secondary" onClick={addRow}>
            <MaterialIcon name="add" className="text-[18px]" /> Add another part
          </PartsButton>
          <PartsButton variant="secondary" onClick={() => setPasteOpen((o) => !o)}>
            <MaterialIcon name="content_paste" className="text-[18px]" /> Paste several numbers
          </PartsButton>
        </div>
      ) : null}

      {pasteOpen ? (
        <div className="rounded-xl bg-[#f3f4fb] p-5 dark:bg-[#0b1220]">
          <p className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-[#30323b] dark:text-[#e2e8f0]">
            <MaterialIcon name="content_paste" className="text-[20px]" /> Paste several numbers
          </p>
          <p className="font-body-sm text-on-surface-variant mb-3">One part number per line. Each line becomes a row.</p>
          <textarea
            className="w-full min-h-[88px] p-3 rounded-lg border border-outline-variant/40 font-mono-sm"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="46410-B1011&#10;46420-B1090"
          />
          <div className="flex gap-2 mt-2">
            <PartsButton variant="primary" onClick={applyPasteLines}>
              Add {pasteText.split(/[\n,]+/).filter((l) => l.trim()).length || ""} rows
            </PartsButton>
            <PartsButton variant="danger" onClick={() => setPasteOpen(false)}>
              Cancel
            </PartsButton>
          </div>
        </div>
      ) : null}

      {!askTypeOpen ? (
        <PartsButton variant="secondary" className="self-start" onClick={() => setAskTypeOpen(true)}>
          Can&apos;t find it? Ask to add a part type
        </PartsButton>
      ) : (
        <div className="rounded-xl border border-outline-variant/30 p-space-md bg-surface-container-lowest">
          <AskPartTypePanel
            onSubmit={async (payload) => {
              await submitPartTypeRequest(payload);
              toast.success("Part type request sent");
              setAskTypeOpen(false);
            }}
          />
          <PartsButton variant="secondary" className="mt-2" onClick={() => setAskTypeOpen(false)}>
            Close
          </PartsButton>
        </div>
      )}

      <div className="hidden sm:block">
        <DFooter
          left={
            <PartsButton variant="secondary" onClick={onBack}>
              <MaterialIcon name="arrow_back" className="text-[18px]" /> Back: the cars
            </PartsButton>
          }
          right={
            <PartsButton variant="primary" onClick={onNext}>
              Next: review <MaterialIcon name="arrow_forward" className="text-[18px]" />
            </PartsButton>
          }
        />
      </div>

      <div className="catalog-parts-mobile-bar fixed bottom-0 left-0 right-0 z-30 flex border-t border-outline-variant/40 bg-surface-container-lowest px-4 py-3 items-center justify-between gap-2 sm:hidden">
        <PartsButton variant="secondary" onClick={onBack}>
          Back
        </PartsButton>
        <PartsButton variant="secondary" onClick={onEditCars ?? onBack}>
          {carCount} car{carCount === 1 ? "" : "s"} · Edit
        </PartsButton>
        <PartsButton variant="primary" onClick={onNext}>
          Review
        </PartsButton>
      </div>
    </div>
  );
}

function PartRowEditor({
  row,
  rowIndex,
  types,
  dupe,
  onChange,
  onRemove,
  onEditCars,
}: {
  row: CatalogPartRow;
  rowIndex: number;
  types: PartTypeRow[];
  dupe: boolean;
  onChange: (p: Partial<CatalogPartRow>) => void;
  onRemove: () => void;
  onEditCars?: () => void;
}) {
  const type = row.partType ?? types.find((t) => t.id === row.partTypeId) ?? null;
  const preview = type
    ? defaultPartNamePreview(type.name, type.positionScheme, row.position, row.side, row.catalogueNumber)
    : "";

  return (
    <>
      <tr className={`align-top ${preview ? "" : "border-b border-[#e6e7ee] dark:border-[#1e293b]"} ${dupe ? "outline outline-2 outline-amber-500/50" : ""}`}>
        <td className="py-4 pl-5 pr-3 sm:pl-8">
          <CatalogPartTypeSelect
            types={types}
            value={row.partTypeId}
            onChange={(t) => onChange({ partTypeId: t?.id ?? "", partType: t })}
          />
        </td>
        <td className="py-4 pr-3">
          <input
            aria-label="Part number"
            placeholder="e.g. 46410-B1011"
            className="w-full h-10 font-mono-md px-3 rounded-lg border border-[#c5c6d0] bg-white dark:bg-[#0b1220] dark:border-[#1e293b]"
            value={row.partNumber}
            onChange={(e) => onChange({ partNumber: e.target.value, brand: row.brand || "Toyota" })}
          />
          {dupe ? <p className="text-[#8a5a00] text-body-sm mt-1">This number is already in row {rowIndex + 1}.</p> : null}
          <ExistingOnFileHint brand={row.brand} number={row.partNumber} onExisting={(id) => onChange({ existingPartId: id })} />
        </td>
        <td className="py-4 pr-3">
          {type ? (
            type.positionScheme === "axle_numbered" ? (
              <AxleNumberedPositionBlock
                position={row.position ?? ""}
                side={row.side ?? ""}
                catalogueNumber={row.catalogueNumber}
                onPosition={(pos) => onChange({ position: pos })}
                onSide={(s) => onChange({ side: s })}
                onCatalogue={(cat) => onChange({ catalogueNumber: cat })}
              />
            ) : (
              <PositionChips
                scheme={type.positionScheme}
                position={row.position ?? ""}
                side={row.side ?? ""}
                onPick={(pos, side) => onChange({ position: pos, side })}
              />
            )
          ) : (
            <span className="text-on-surface-variant text-body-sm">Pick a type first</span>
          )}
        </td>
        <td className="py-4 pr-3 align-top">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-[#f3f4fb] px-3 py-2 dark:bg-[#0b1220]">
            <div className="flex flex-col">
              <span className="text-[12px] text-[#5d5f68] dark:text-[#94a3b8]">Applies to</span>
              <span className="text-[13px] font-medium text-[#30323b] dark:text-[#e2e8f0]">Same as cars</span>
            </div>
            {onEditCars ? (
              <PartsButton variant="secondary" className="!h-7 !px-2 text-[12px]" onClick={onEditCars}>
                Change
              </PartsButton>
            ) : null}
          </div>
        </td>
        <td className="py-4 pr-5 sm:pr-8">
          <PartsButton variant="danger" className="!h-9 !w-9 !p-0 !bg-[#fdecec] dark:!bg-[#450a0a]" onClick={onRemove} aria-label="Remove row">
            <MaterialIcon name="delete" className="text-[18px]" />
          </PartsButton>
        </td>
      </tr>
      {preview ? (
        <tr className="border-b border-[#e6e7ee] dark:border-[#1e293b]">
          <td colSpan={5} className="pb-4 pl-5 sm:pl-8">
            <span className="inline-flex items-center gap-2 rounded-lg bg-[#f3f4fb] px-3 py-1.5 text-[13px] text-[#5d5f68] dark:bg-[#0b1220] dark:text-[#94a3b8]">
              <MaterialIcon name="label" className="text-[16px]" />
              Saves as <span className="font-semibold text-[#30323b] dark:text-[#e2e8f0]">{preview}</span>
            </span>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MobilePartCard({
  row,
  rowIndex,
  types,
  dupe,
  brandDefault,
  onChange,
  onRemove,
}: {
  row: CatalogPartRow;
  rowIndex: number;
  types: PartTypeRow[];
  dupe: boolean;
  brandDefault: string;
  onChange: (p: Partial<CatalogPartRow>) => void;
  onRemove: () => void;
}) {
  const type = row.partType ?? types.find((t) => t.id === row.partTypeId) ?? null;
  return (
    <article className={`rounded-xl border p-space-md bg-surface-container-lowest ${dupe ? "border-amber-500/60" : "border-outline-variant/30"}`}>
      <CatalogPartTypeSelect
        types={types}
        value={row.partTypeId}
        onChange={(t) => onChange({ partTypeId: t?.id ?? "", partType: t, brand: row.brand || brandDefault })}
      />
      <input
        className="w-full h-10 font-mono-md px-2 rounded-lg border border-outline-variant/40 mb-2"
        placeholder="Part number"
        value={row.partNumber}
        onChange={(e) => onChange({ partNumber: e.target.value, brand: row.brand || brandDefault })}
      />
      {dupe ? <p className="text-[#8a5a00] text-body-sm mb-2">This number is already in row {rowIndex + 1}.</p> : null}
      {type ? (
        <div className="mb-2">
          <p className="font-label-sm text-on-surface-variant mb-1 inline-flex items-center gap-1">
            Where on the car
            <WhereOnCarHelpPopover />
          </p>
          {type.positionScheme === "axle_numbered" ? (
            <AxleNumberedPositionBlock
              position={row.position ?? ""}
              side={row.side ?? ""}
              catalogueNumber={row.catalogueNumber}
              onPosition={(pos) => onChange({ position: pos })}
              onSide={(s) => onChange({ side: s })}
              onCatalogue={(cat) => onChange({ catalogueNumber: cat })}
            />
          ) : (
            <PositionChips
              scheme={type.positionScheme}
              position={row.position ?? ""}
              side={row.side ?? ""}
              onPick={(pos, side) => onChange({ position: pos, side })}
            />
          )}
        </div>
      ) : null}
      <PartsButton variant="danger" className="w-full" onClick={onRemove}>
        Remove
      </PartsButton>
    </article>
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
  }, [q.data?.found, q.data?.partId, onExisting]);
  if (!q.data?.found) return null;
  return <p className="text-primary text-body-sm mt-1">Already on file — we&apos;ll add these cars to it.</p>;
}
