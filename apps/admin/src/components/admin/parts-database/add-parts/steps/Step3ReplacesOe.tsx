// Stitch AP7
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { AddPartsDraft } from "../addPartsTypes";
import type { SelfServePreview } from "../addPartsApi";
import { fetchVehicleOptions } from "../../partsDatabaseApi";

export function Step3ReplacesOe({
  draft,
  setDraft,
  preview,
}: {
  draft: AddPartsDraft;
  setDraft: (d: AddPartsDraft) => void;
  preview: SelfServePreview | null;
  onSkip: () => void;
}) {
  const makes = useQuery({ queryKey: ["vehicle-options-makes"], queryFn: () => fetchVehicleOptions({}) });
  const [brand, setBrand] = useState("Toyota");
  const [number, setNumber] = useState("");

  const makerOptions = makes.data?.makes ?? [];
  const extraReach = preview?.oeExtraCarCount ?? 0;
  const oePreviewCars = preview?.oePreviewCars ?? [];

  function removeRow(index: number) {
    setDraft({ ...draft, factoryNumbers: draft.factoryNumbers.filter((_, j) => j !== index) });
  }

  return (
    <div className="flex flex-col gap-space-lg max-w-[920px] mx-auto w-full">
      <div>
        <h2 className="font-headline-xl text-headline-xl text-on-surface">Replaces a factory number</h2>
        <p className="font-body-md text-on-surface-variant mt-1">
          Optional — link aftermarket numbers to OEM cross-refs when the catalogue lists them.
        </p>
      </div>

      <div className="flex flex-col gap-space-sm">
        {draft.factoryNumbers.map((r, i) => (
          <div
            key={`${r.brand}-${r.number}-${i}`}
            className="p-space-md bg-surface rounded-lg shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md"
          >
            <div className="w-full md:w-56 space-y-1">
              <label className="font-label-xs text-label-xs uppercase tracking-wider text-outline block">Car maker</label>
              <div className="relative">
                <select
                  className="w-full h-9 bg-surface-container-lowest text-on-surface font-body-sm px-3 pr-8 rounded focus:outline-none focus:bg-surface shadow-sm appearance-none"
                  value={r.brand}
                  onChange={(e) => {
                    const next = [...draft.factoryNumbers];
                    next[i] = { ...r, brand: e.target.value };
                    setDraft({ ...draft, factoryNumbers: next });
                  }}
                >
                  {makerOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <MaterialIcon name="expand_more" className="absolute right-2 top-2 text-outline pointer-events-none text-[18px]" />
              </div>
            </div>
            <div className="w-full md:flex-1 space-y-1">
              <label className="font-label-xs text-label-xs uppercase tracking-wider text-outline block">Factory number · OE</label>
              <input
                className="w-full h-9 bg-surface-container-lowest font-mono-md text-on-surface px-3 rounded uppercase focus:outline-none focus:bg-surface shadow-sm tracking-wider"
                value={r.number}
                onChange={(e) => {
                  const next = [...draft.factoryNumbers];
                  next[i] = { ...r, number: e.target.value };
                  setDraft({ ...draft, factoryNumbers: next });
                }}
              />
            </div>
            <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-space-sm pt-2 md:pt-5">
              <span className="inline-flex items-center px-2 py-1 rounded font-mono-sm font-semibold bg-primary-fixed text-on-primary-fixed">
                {i === 0 ? "Direct OE Match · Tier 1" : "Superseded successor"}
              </span>
              <button
                type="button"
                className="w-9 h-9 rounded flex items-center justify-center text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors"
                aria-label="Remove factory number"
                onClick={() => removeRow(i)}
              >
                <MaterialIcon name="delete_outline" className="text-[20px]" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-space-md rounded-xl border border-outline-variant/40 p-space-md bg-surface-container-low/30">
        <div className="flex flex-col md:flex-row gap-space-md">
          <div className="w-full md:w-56 space-y-1">
            <label className="font-label-xs text-label-xs uppercase tracking-wider text-outline block">Car maker</label>
            <div className="relative">
              <select
                className="w-full h-9 bg-surface-container-lowest text-on-surface font-body-sm px-3 pr-8 rounded appearance-none shadow-sm"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                <option value="">Choose maker</option>
                {makerOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <MaterialIcon name="expand_more" className="absolute right-2 top-2 text-outline pointer-events-none text-[18px]" />
            </div>
          </div>
          <div className="w-full md:flex-1 space-y-1">
            <label className="font-label-xs text-label-xs uppercase tracking-wider text-outline block">Factory number · OE</label>
            <input
              className="w-full h-9 bg-surface-container-lowest font-mono-md px-3 rounded uppercase border-0 shadow-sm"
              placeholder="04465-B1190"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-space-md h-9 bg-surface-container-low text-primary font-label-md rounded hover:bg-secondary-fixed transition-colors shadow-sm self-start"
          onClick={() => {
            const n = number.trim();
            const b = brand.trim();
            if (!n || !b) return;
            setDraft({ ...draft, factoryNumbers: [...draft.factoryNumbers, { brand: b, number: n }] });
            setNumber("");
          }}
        >
          <MaterialIcon name="add_circle" className="text-[18px]" />
          + Add another factory number
        </button>
      </div>

      {extraReach > 0 && draft.factoryNumbers.length > 0 ? (
        <div className="bg-primary-fixed/40 rounded-xl p-space-lg shadow-sm space-y-space-md">
          <div className="flex items-start justify-between gap-space-md flex-wrap">
            <div className="flex items-start gap-space-sm">
              <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0">
                <MaterialIcon name="alt_route" className="text-[18px]" />
              </div>
              <div>
                <div className="font-headline-md text-on-surface font-semibold">
                  {extraReach} more car{extraReach === 1 ? "" : "s"} carry {draft.factoryNumbers[0]?.brand}{" "}
                  {draft.factoryNumbers[0]?.number} and will show this part too
                </div>
                <p className="font-body-sm text-on-surface-variant">
                  These show as <span className="font-semibold text-tertiary">&apos;Needs checking&apos;</span> until confirmed by catalog review.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-space-xs">
            {(oePreviewCars.length ? oePreviewCars : [
              { label: "Toyota Passo M700A", years: "(2016–present)", engine: "1KR-FE", position: "Front" },
            ]).slice(0, 3).map((row, idx) => (
              <div key={idx} className="flex items-center justify-between p-space-sm bg-surface-container-lowest rounded shadow-sm">
                <div className="flex items-center gap-space-sm flex-wrap min-w-0">
                  <MaterialIcon name="directions_car" className="text-outline text-[18px]" />
                  <span className="font-body-md text-on-surface font-medium">{row.label}</span>
                  {row.years ? <span className="font-mono-sm text-outline">{row.years}</span> : null}
                  {row.engine ? (
                    <>
                      <span className="text-outline">·</span>
                      <span className="font-mono-sm text-on-surface-variant font-semibold">{row.engine}</span>
                    </>
                  ) : null}
                  {row.position ? (
                    <>
                      <span className="text-outline">·</span>
                      <span className="font-label-xs text-on-surface-variant uppercase">{row.position}</span>
                    </>
                  ) : null}
                </div>
                <span className="font-mono-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium shrink-0">
                  Needs checking
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {draft.partType?.defaultFitMode === "spec" ? (
        <p className="font-label-xs text-outline italic border-t border-outline-variant/30 pt-space-md">
          Spec-based part types often skip OE rows — fleet still finds them by size.
        </p>
      ) : null}
    </div>
  );
}
