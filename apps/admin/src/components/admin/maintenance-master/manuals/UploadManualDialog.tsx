import { useEffect, useMemo, useRef, useState } from "react";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { EMPTY_PICK, MmCarPicker, type CarPick } from "../MmCarPicker";
import {
  MARKETS,
  getCarScope,
  identifyDocument,
  uploadManual,
  type DocType,
  type IdentifyResult,
  type Market,
} from "./manualsApi";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Icon, Pill } from "./manualsUi";
import { drawPage, pageAsJpegBase64, readPagesText, readPdfFile, type PdfInfo } from "./pdfTools";

/**
 * Screens 1, 2, 3 and 7 of build step 6b: choose the PDF, Roam reads its first pages and fills in the car, country,
 * document type, name, printed date and pages; the owner checks and presses Upload (DOC-01 … DOC-05).
 */
type Props = {
  open: boolean;
  token: string;
  catalog: VehicleCatalogRecord[];
  /** Opened from a model's row: that model is already known. */
  preset?: { platformId: string; name: string } | null;
  onClose: () => void;
  onUploaded: (manualId: string, platformId: string) => void;
};

const MAX_BYTES = 100 * 1024 * 1024;

type Step = "choose" | "reading" | "found";

function Thumb({ info, pdfPage }: { info: PdfInfo; pdfPage: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    setBad(false);
    drawPage(info.doc, pdfPage, ref.current, 72).catch(() => setBad(true));
  }, [info, pdfPage]);
  return (
    <div className="flex h-[96px] w-[72px] items-center justify-center overflow-hidden rounded-md border border-[#e6e7ee] bg-white shadow-sm">
      {bad ? <Icon name="description" className="text-[28px] text-[#c5c6d0]" /> : <canvas ref={ref} />}
    </div>
  );
}

/** "402–407, 412, 520" (printed) → PDF page list. */
export function parsePrintedPages(input: string, offset: number, pageCount: number): number[] {
  const out = new Set<number>();
  for (const part of input.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:[-–](\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let p = Math.min(a, b); p <= Math.max(a, b); p += 1) {
      const pdf = p + offset;
      if (pdf >= 1 && pdf <= pageCount) out.add(pdf);
    }
  }
  return [...out].sort((x, y) => x - y);
}

/** Group PDF pages into chips, shown as printed numbers ("Front page 3" when the printed number would be < 1). */
export function pageChips(pdfPages: number[], offset: number): Array<{ label: string; pages: number[] }> {
  const sorted = [...new Set(pdfPages)].sort((a, b) => a - b);
  const chips: Array<{ label: string; pages: number[] }> = [];
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const first = run[0] - offset;
    const last = run[run.length - 1] - offset;
    const label = first < 1 ? (run.length === 1 ? `Front page ${run[0]}` : `Front pages ${run[0]}–${run[run.length - 1]}`) : first === last ? String(first) : `${first}–${last}`;
    chips.push({ label, pages: run });
    run = [];
  };
  for (const p of sorted) {
    const prev = run[run.length - 1];
    const crossesFront = prev != null && (prev - offset < 1) !== (p - offset < 1);
    if (prev != null && (p !== prev + 1 || crossesFront)) flush();
    run.push(p);
  }
  flush();
  return chips;
}

export function UploadManualDialog({ open, token, catalog, preset, onClose, onUploaded }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [found, setFound] = useState<IdentifyResult | null>(null);
  const [scanned, setScanned] = useState(false);
  const [docType, setDocType] = useState<DocType>("schedule");
  const [family, setFamily] = useState<{ platformId: string; name: string } | null>(null);
  const [yearsKey, setYearsKey] = useState("");
  const [car, setCar] = useState<CarPick>(EMPTY_PICK);
  const [market, setMarket] = useState<Market | "">("");
  const [title, setTitle] = useState("");
  const [offset, setOffset] = useState(0);
  const [pdfPages, setPdfPages] = useState<number[]>([]);
  const [addInput, setAddInput] = useState("");
  const [stage, setStage] = useState<"" | "starting" | "sending" | "queueing">("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep("choose");
    setFile(null);
    setInfo(null);
    setFound(null);
    setScanned(false);
    setDocType("schedule");
    setFamily(preset ? { platformId: preset.platformId, name: preset.name } : null);
    setYearsKey("");
    setCar(EMPTY_PICK);
    setMarket("");
    setTitle("");
    setOffset(0);
    setPdfPages([]);
    setAddInput("");
    setStage("");
    setError("");
  }, [open, preset]);

  // When Roam could not place the car, the owner picks it; the model family comes from the car lookup.
  useEffect(() => {
    if (!open || family || !car.versionId || !token) return;
    let live = true;
    void getCarScope(token, car.versionId)
      .then((s) => {
        if (!live) return;
        if (s.model) setFamily({ platformId: s.model.platform_id, name: s.model.name });
        else setError("This car has no model family yet, so a manual can't be added for it.");
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Could not look up that car."));
    return () => {
      live = false;
    };
  }, [open, family, car.versionId, token]);

  const yearOptions = useMemo(() => {
    const ys = found?.family?.years ?? [];
    const opts = ys
      .filter((y) => y.from)
      .map((y) => ({ key: `${y.from}-${y.to ?? ""}`, label: y.to ? `${y.from}–${y.to}` : `${y.from}–`, from: y.from, to: y.to }));
    const uniq = new Map(opts.map((o) => [o.key, o]));
    return [...uniq.values()].sort((a, b) => Number(b.from) - Number(a.from));
  }, [found]);
  const chosenYears = yearOptions.find((o) => o.key === yearsKey) ?? null;

  if (!open) return null;

  const fieldSure = (name: string) => found?.fields?.[name]?.sure !== false;
  const fieldReason = (name: string) => found?.fields?.[name]?.reason ?? "";

  const choose = async (f: File | null) => {
    setError("");
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError("That file is bigger than 100 MB. Save a smaller copy of the document.");
      return;
    }
    setFile(f);
    setStep("reading");
    let readOk = false;
    try {
      const read = await readPdfFile(f);
      readOk = true;
      setInfo(read);
      const first = Array.from({ length: Math.min(15, read.pageCount) }, (_, i) => i + 1);
      const texts = (await readPagesText(read.doc, first)).filter((t) => t.text.length > 20);
      const isScan = texts.length === 0;
      // The first words of every page (its running header), read here for free, so the reader can find the
      // specifications chapter at the back of a 500-page book.
      const heads = isScan
        ? []
        : (await readPagesText(read.doc, Array.from({ length: read.pageCount }, (_, i) => i + 1)))
          .map((t) => ({ pdf_page: t.pdf_page, text: t.text.slice(0, 100) }))
          .filter((t) => t.text.length > 0);
      setScanned(isScan);
      const images = isScan
        ? await Promise.all(first.slice(0, 6).map((p) => pageAsJpegBase64(read.doc, p).catch(() => "")))
        : [];
      const result = await identifyDocument(token, {
        file_name: f.name,
        page_count: read.pageCount,
        pages_text: texts,
        page_heads: heads,
        page_images: images.filter(Boolean),
        page_images_type: "image/jpeg",
      });
      setFound(result);
      setDocType(result.doc_type === "owners_manual" ? "owners_manual" : "schedule");
      if (!preset && result.family) setFamily({ platformId: result.family.platform_id, name: result.family.name });
      const yk = result.year_from ? `${result.year_from}-${result.year_to ?? ""}` : "";
      setYearsKey(yk);
      setMarket((MARKETS.find((m) => m.value === String(result.market ?? "").toUpperCase())?.value ?? "") as Market | "");
      setTitle(result.title ?? f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
      setOffset(Number(result.page_offset ?? 0));
      setPdfPages(result.pages.map((p) => p.pdf_page));
      setStep("found");
    } catch (e: unknown) {
      // Roam could not read it: the owner fills in the form by hand.
      setError(e instanceof Error ? e.message : "Roam could not read this PDF. Fill in the form yourself.");
      setStep(readOk ? "found" : "choose");
    }
  };

  const chips = pageChips(pdfPages, offset);
  const blocker = !file || !info
    ? "Choose the PDF."
    : !family
      ? "Pick the car."
      : !market
        ? "Choose the country."
        : found?.family?.years?.length && !chosenYears
          ? "Choose the years."
          : !title.trim()
            ? "Give the document a name."
            : !pdfPages.length
              ? "Add the pages to read."
              : "";

  const send = async () => {
    if (blocker || !file || !info || !family || !market) return;
    setError("");
    try {
      const { manualId } = await uploadManual(
        token,
        {
          platform_id: family.platformId,
          market,
          title: title.trim(),
          file_sha256: info.sha256,
          page_count: info.pageCount,
          page_from: Math.min(...pdfPages),
          page_to: Math.max(...pdfPages),
          file_bytes: file.size,
          doc_type: docType,
          pages: pdfPages,
          page_offset: offset,
          year_from: chosenYears?.from ?? null,
          year_to: chosenYears?.to ?? null,
          printed_date: found?.printed_date ?? null,
        },
        file,
        setStage,
      );
      onUploaded(manualId, family.platformId);
    } catch (e: unknown) {
      setStage("");
      setError(e instanceof Error ? e.message : "The document could not be uploaded.");
    }
  };

  const busy = stage !== "";
  const stageText =
    stage === "starting" ? "Getting ready…" : stage === "sending" ? "Sending the PDF…" : stage === "queueing" ? "Starting to read…" : "";
  const amber = "border-[#e0b44a] ring-1 ring-[#e0b44a]";
  const SureLine = ({ name, fallback }: { name: string; fallback: string }) =>
    fieldSure(name) ? (
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#006e31]">
        <Icon name="check_circle" className="text-[16px]" />
        {fieldReason(name) || fallback}
      </p>
    ) : (
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#8a5a00]">
        <Icon name="info" className="text-[16px]" />
        {fieldReason(name) || "Roam is not sure. Check this."}
      </p>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6" role="dialog" aria-modal="true" aria-label="Add a car document">
      <div className="relative w-full max-w-[720px] rounded-[20px] bg-white p-8 text-[#30323b] shadow-2xl" data-testid="mm-upload-manual">
        <button
          type="button"
          className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-lg border border-[#c5c6d0] bg-white hover:bg-[#f3f4fb]"
          aria-label="Close"
          onClick={onClose}
          disabled={busy}
        >
          <Icon name="close" className="text-[20px]" />
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => void choose(e.target.files?.[0] ?? null)}
        />

        {step === "choose" ? (
          <>
            <h2 className="text-[26px] font-semibold">Add a car document</h2>
            <p className="mt-1 text-[15px] text-[#5d5f68]">Drop in a maintenance sheet, a maintenance booklet or an owner's manual. Roam fills in the rest.</p>
            {error ? <p className="mt-4 rounded-[10px] bg-[#fdecec] px-3 py-2 text-[14px] text-[#a83836]">{error}</p> : null}
            <button
              type="button"
              className="mt-6 flex h-[240px] w-full flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-[#c5c6d0] bg-[#f9f9fd] hover:bg-[#f3f4fb]"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void choose(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dbe1ff]">
                <Icon name="upload_file" className="text-[28px] text-[#0153dc]" />
              </span>
              <span className="text-[17px] font-semibold">Drop the PDF here</span>
              <span className="text-[13px] text-[#5d5f68]">or</span>
              <span className={BTN_SECONDARY}>Choose a PDF</span>
              <span className="text-[13px] text-[#5d5f68]">Up to 100 MB</span>
            </button>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ["event_repeat", "Maintenance sheet or booklet — when each part is changed"],
                ["menu_book", "Owner's manual — oil, tyres, battery and bulbs"],
                ["translate", "Japanese or English"],
              ].map(([icon, text]) => (
                <div key={text} className="flex items-start gap-2 rounded-xl bg-[#f3f4fb] p-3 text-[13px]">
                  <Icon name={icon} className="text-[20px] text-[#0153dc]" />
                  {text}
                </div>
              ))}
            </div>
            <div className="mt-8">
              <button type="button" className={BTN_DANGER} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : null}

        {step === "reading" ? (
          <div className="flex flex-col items-center py-16 text-center" data-testid="mm-upload-reading">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dbe1ff]">
              <Icon name="sync" className="animate-spin text-[28px] text-[#0153dc]" />
            </span>
            <p className="mt-4 text-[17px] font-semibold">Reading the pages…</p>
            <p className="mt-1 text-[14px] text-[#5d5f68]">{file?.name}</p>
          </div>
        ) : null}

        {step === "found" ? (
          <>
            <h2 className="flex items-center gap-2 text-[26px] font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e6f4ea]">
                <Icon name="check_circle" className="text-[22px] text-[#006e31]" />
              </span>
              {found && !found.unsure.length ? "Roam found this" : "Roam found some of this"}
            </h2>
            <p className="mt-1 text-[15px] text-[#5d5f68]">
              {scanned ? "This PDF is a scan, so Roam read the first pages as pictures. " : ""}
              Check it, then press Upload.
            </p>
            {error ? (
              <p className="mt-4 rounded-[10px] border border-[#f3c5c4] bg-[#fdecec] px-3 py-2 text-[14px] text-[#a83836]" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#f3f4fb] p-4">
              <Icon name="picture_as_pdf" className="text-[32px] text-[#a83836]" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[15px]">{file?.name}</p>
                <p className="text-[13px] text-[#5d5f68]">
                  {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : ""} · {info?.pageCount ?? "?"} pages
                </p>
              </div>
              <button type="button" className={BTN_SECONDARY} onClick={() => inputRef.current?.click()} disabled={busy}>
                Choose another file
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <p className="text-[15px] font-semibold">What is it?</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {(
                    [
                      { value: "schedule" as const, icon: "event_repeat", title: "Service schedule", line: "When each part is changed" },
                      { value: "owners_manual" as const, icon: "menu_book", title: "Owner's manual", line: "Oil, tyres, battery and bulbs" },
                    ] as const
                  ).map((o) => {
                    const on = docType === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        className={`relative rounded-2xl border p-4 text-left ${on ? "border-2 border-[#0153dc] bg-[#f3f6ff]" : "border-[#c5c6d0] bg-white"}`}
                        onClick={() => setDocType(o.value)}
                      >
                        <Pill tone={o.value === "schedule" ? "blue" : "slate"} icon={o.icon}>
                          {o.title}
                        </Pill>
                        {on ? <Icon name="check_circle" className="absolute right-3 top-3 text-[22px] text-[#0153dc]" /> : null}
                        <span className="mt-2 block text-[14px] text-[#5d5f68]">{o.line}</span>
                      </button>
                    );
                  })}
                </div>
                {found ? <SureLine name="doc_type" fallback="From the first pages" /> : null}
              </div>

              <div>
                <p className="text-[15px] font-semibold">Car</p>
                {family ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 rounded-[10px] border border-[#c5c6d0] px-3 py-3 text-[15px]">
                      <Icon name="directions_car" className="text-[20px] text-[#0153dc]" />
                      <span className="flex-1">{family.name.replace(/\s\d{4}.*$/, "")}</span>
                      {!preset ? (
                        <button type="button" className={`${BTN_SECONDARY} h-9 text-[13px]`} onClick={() => setFamily(null)}>
                          Change car
                        </button>
                      ) : null}
                    </div>
                    {yearOptions.length ? (
                      <label className="block">
                        <select
                          className={`h-11 w-full rounded-[10px] border bg-white px-3 text-[15px] ${fieldSure("printed_date") && chosenYears ? "border-[#c5c6d0]" : amber}`}
                          value={yearsKey}
                          onChange={(e) => setYearsKey(e.target.value)}
                          aria-label="Years"
                        >
                          <option value="">Choose the years</option>
                          {yearOptions.map((o) => (
                            <option key={o.key} value={o.key}>
                              Years {o.label}
                            </option>
                          ))}
                        </select>
                        {found?.years_from_printed_date && found.printed_date ? (
                          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#8a5a00]">
                            <Icon name="info" className="text-[16px]" />
                            Roam used the date printed on the document: {found.printed_date}. Check the years.
                          </p>
                        ) : null}
                      </label>
                    ) : null}
                    {found?.family?.close_names?.length ? (
                      <p className="flex items-start gap-1.5 text-[13px] text-[#006e31]">
                        <Icon name="check_circle" className="text-[16px]" />
                        Covers {found.family.close_names.join(", ")} — the same car under {found.family.close_names.length} names.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2">
                    {found?.close_families?.length ? (
                      <div className="mb-3 space-y-2">
                        <p className="text-[13px] text-[#8a5a00]">
                          This document fits {found.close_families.length} model families. Pick the one it is for.
                        </p>
                        {found.close_families.map((f) => (
                          <button
                            key={f.platform_id}
                            type="button"
                            disabled={busy}
                            className="flex min-h-[44px] w-full items-center gap-3 rounded-[10px] border border-[#c5c6d0] bg-white px-3 py-2 text-left hover:border-[#0153dc] hover:bg-[#f3f6ff]"
                            onClick={() => {
                              setFound({ ...found, family: { ...f, close_names: [] } });
                              setFamily({ platformId: f.platform_id, name: f.name });
                            }}
                          >
                            <Icon name="directions_car" className="text-[20px] text-[#0153dc]" />
                            <span className="flex-1">
                              <span className="block text-[15px] font-medium">{f.name}</span>
                              {f.label ? <span className="block text-[13px] text-[#5d5f68]">{f.label}</span> : null}
                            </span>
                            <span className="text-[13px] font-medium text-[#0153dc]">Pick</span>
                          </button>
                        ))}
                        <p className="text-[13px] text-[#5d5f68]">Or find the car yourself:</p>
                      </div>
                    ) : null}
                    <MmCarPicker catalog={catalog} value={car} onChange={setCar} disabled={busy} />
                    {found?.close_families?.length ? null : (
                      <p className="mt-1 text-[13px] text-[#8a5a00]">Roam could not place the car. Pick it.</p>
                    )}
                  </div>
                )}
              </div>

              <label className="block">
                <span className="text-[15px] font-semibold">Country</span>
                <select
                  className={`mt-2 h-11 w-full rounded-[10px] border bg-white px-3 text-[15px] ${market && fieldSure("market") ? "border-[#c5c6d0]" : amber}`}
                  value={market}
                  onChange={(e) => setMarket(e.target.value as Market)}
                  disabled={busy}
                >
                  <option value="">Choose the country</option>
                  {MARKETS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {found ? <SureLine name="market" fallback="From the document" /> : null}
              </label>

              <label className="block">
                <span className="text-[15px] font-semibold">Name</span>
                <input
                  className="mt-2 h-11 w-full rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[15px]"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={busy}
                  maxLength={200}
                />
              </label>

              <div>
                <p className="text-[15px] font-semibold">Pages to read</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {chips.map((c) => (
                    <span key={c.label} className="inline-flex h-9 items-center gap-1 rounded-full bg-[#f1f5f9] pl-3 pr-1 font-mono text-[13px]">
                      {c.label}
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white"
                        aria-label={`Remove pages ${c.label}`}
                        onClick={() => setPdfPages((prev) => prev.filter((p) => !c.pages.includes(p)))}
                      >
                        <Icon name="close" className="text-[16px]" />
                      </button>
                    </span>
                  ))}
                  <input
                    className="h-9 w-36 rounded-full border border-[#c5c6d0] px-3 font-mono text-[13px]"
                    placeholder="e.g. 402–407"
                    value={addInput}
                    onChange={(e) => setAddInput(e.target.value)}
                    aria-label="Pages to add"
                  />
                  <button
                    type="button"
                    className={`${BTN_SECONDARY} h-9 text-[13px]`}
                    disabled={!addInput.trim() || !info}
                    onClick={() => {
                      if (!info) return;
                      const add = parsePrintedPages(addInput, offset, info.pageCount);
                      setPdfPages((prev) => [...new Set([...prev, ...add])].sort((a, b) => a - b));
                      setAddInput("");
                    }}
                  >
                    <Icon name="add" className="text-[16px]" />
                    Add pages
                  </button>
                </div>
                {info && chips.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {chips.slice(0, 6).map((c) => (
                      <figure key={c.label} className="flex flex-col items-center gap-1">
                        <Thumb info={info} pdfPage={c.pages[0]} />
                        <figcaption className="font-mono text-[11px] text-[#5d5f68]">{c.label.split("–")[0]}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}
                {pdfPages.length && info ? (
                  <p className="mt-2 text-[13px] text-[#006e31]">
                    {pdfPages.length} page{pdfPages.length === 1 ? "" : "s"} to read
                    {info.pageCount > pdfPages.length ? ` instead of ${info.pageCount}` : ""}
                    {found?.pages.length ? ` — ${found.pages[0].reason}` : ""}
                  </p>
                ) : null}
                {offset ? (
                  <p className="mt-1 text-[12px] text-[#5d5f68]">Page numbers are the ones printed in the book (printed = PDF page − {offset}).</p>
                ) : null}
              </div>

              {docType === "owners_manual" ? (
                <p className="flex items-start gap-2 rounded-xl bg-[#f3f4fb] p-3 text-[14px]">
                  <Icon name="info" className="text-[18px] text-[#0153dc]" />
                  An owner's manual rarely gives the full service schedule. Add the car's maintenance sheet or booklet for that.
                </p>
              ) : null}
            </div>

            <div className="mt-8 flex items-center justify-between gap-3">
              <button type="button" className={BTN_DANGER} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <div className="text-right">
                <button type="button" className={BTN_PRIMARY} onClick={() => void send()} disabled={busy || Boolean(blocker)}>
                  <Icon name="upload" className="text-[20px]" />
                  {busy ? stageText : "Upload and read"}
                </button>
                {blocker && !busy ? <p className="mt-1 text-[13px] text-[#5d5f68]">{blocker}</p> : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

