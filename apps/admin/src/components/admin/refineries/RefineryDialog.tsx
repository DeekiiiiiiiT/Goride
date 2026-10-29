// Stitch: dominion-redesign/b5d38bb1591b49f1b8e082b14790205f
import { useEffect, useRef, useState } from "react";
import { refineriesApi, type BoardProduct } from "./refineriesApi";
import { formatJmd, formatUnit } from "./refineryFormat";

const COPY = {
  backdrop: "Registered Refineries & Price Baselines",
  add: "+ Add refinery",
  shell: "notifications help_outline",
  name: "Name *",
  operator: "Operator *",
  source: "Source link or document *",
  reason: "Reason *",
  next: "Continue arrow_forward",
};

const CODES = ["gasolene_87", "gasolene_90", "auto_diesel", "ulsd", "kerosene", "propane", "butane", "hfo", "asphalt"];

export function RefineryDialog({
  open,
  step,
  refinerySlug,
  products,
  existingWeek,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  step: 1 | 2;
  refinerySlug: string;
  products: BoardProduct[];
  existingWeek: string | null;
  onClose: () => void;
  onCreated: (slug: string, manual: boolean) => void;
  onSaved: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<1 | 2>(step);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [operator, setOperator] = useState("");
  const [status, setStatus] = useState<"active" | "planned" | "closed">("active");
  const [website, setWebsite] = useState("");
  const [sourceKind, setSourceKind] = useState<"petrojam_html" | "manual">("manual");
  const [benchmark, setBenchmark] = useState(false);
  const [benchmarkReason, setBenchmarkReason] = useState("");
  const [date, setDate] = useState(existingWeek || new Date().toISOString().slice(0, 10));
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [sourceUrl, setSourceUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBody, setFileBody] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent(step);
    setError("");
    const node = root.current;
    const previous = document.activeElement as HTMLElement | null;
    const items = () => [...(node?.querySelectorAll<HTMLElement>("button, input, select, textarea") || [])].filter((el) => !el.hasAttribute("disabled"));
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, step, onClose]);

  if (!open) return null;

  async function saveRefinery() {
    if (!name.trim() || !operator.trim()) {
      setError("Name and operator are required.");
      return;
    }
    if (benchmark && !benchmarkReason.trim()) {
      setError("A reason is required to change the benchmark.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await refineriesApi.create({
        name: name.trim(),
        operator: operator.trim(),
        country: "JM",
        website,
        status,
        source_kind: sourceKind,
        price_source_url: sourceKind === "petrojam_html" ? "https://www.petrojam.com/price/" : "",
        is_benchmark: benchmark,
        reason: benchmarkReason,
      });
      const next = saved.refinery.slug;
      setSlug(next);
      onCreated(next, sourceKind === "manual");
      if (sourceKind === "manual") setCurrent(2);
      else onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the refinery.");
    } finally {
      setBusy(false);
    }
  }

  async function savePrices() {
    if (!date || !reason.trim() || (!sourceUrl.trim() && !fileBody)) {
      setError("Date, a source link or document, and a reason are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const amounts: Record<string, number> = {};
      for (const [code, value] of Object.entries(prices)) {
        if (value.trim()) amounts[code] = Number(value);
      }
      await refineriesApi.savePrices(slug || refinerySlug, {
        effective_date: date,
        prices: amounts,
        source_url: sourceUrl.trim(),
        reason: reason.trim(),
        document_name: fileName || undefined,
        document_base64: fileBody || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save prices.");
    } finally {
      setBusy(false);
    }
  }

  const catalog = products.length
    ? products
    : CODES.map((code, index) => ({ code, label: code, unit: index < 4 ? "per litre" : null, boardGroup: index < 4 ? "motor" : "other" } as BoardProduct));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-6 overflow-y-auto" data-backdrop={COPY.backdrop} data-add={COPY.add} data-shell={COPY.shell}>
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby="refinery-dialog-title" className="bg-surface-container-lowest rounded-2xl shadow-2xl overflow-hidden w-full max-w-[640px] flex flex-col">
        {current === 1 ? (
          <>
            <div className="px-6 pt-6 pb-4 bg-surface-container-lowest">
              <div className="flex items-center justify-between mb-4">
                <h2 id="refinery-dialog-title" className="font-semibold text-lg text-on-surface">Add refinery</h2>
                <button type="button" className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant" title="Close dialog" onClick={onClose}>
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <div className="flex items-center w-full px-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-secondary text-on-secondary flex items-center justify-center text-xs font-semibold">1</div>
                  <span className="text-xs font-semibold text-secondary">Refinery</span>
                </div>
                <div className="flex-1 h-0.5 mx-4 bg-surface-variant" />
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-surface-variant text-outline flex items-center justify-center text-xs font-semibold">2</div>
                  <span className="text-xs font-medium text-outline">Prices</span>
                </div>
              </div>
            </div>
            <form className="p-6 space-y-4 bg-surface-container-lowest overflow-y-auto max-h-[70vh]" onSubmit={(event) => { event.preventDefault(); void saveRefinery(); }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-on-surface">{COPY.name.slice(0, 4)} <span className="text-error">*</span></label>
                  <input className="w-full px-3 py-2 text-xs bg-surface text-on-surface rounded-lg" placeholder="e.g. Petrojam or St. Croix Refinery" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-on-surface">{COPY.operator.slice(0, 8)} <span className="text-error">*</span></label>
                  <input className="w-full px-3 py-2 text-xs bg-surface text-on-surface rounded-lg" placeholder="e.g. Petroleum Corporation of Jamaica" value={operator} onChange={(event) => setOperator(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-on-surface">Country</label>
                  <select className="w-full px-3 py-2 text-xs bg-surface-container text-on-surface rounded-lg" disabled value="JM"><option>Jamaica</option></select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-on-surface">Status</label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-surface rounded-lg text-xs font-medium text-center">
                    {(["active", "planned", "closed"] as const).map((item) => (
                      <button key={item} type="button" className={`py-1 rounded capitalize ${status === item ? "bg-secondary text-on-secondary font-semibold" : "text-on-surface-variant"}`} onClick={() => setStatus(item)}>{item === "active" ? "Active" : item === "planned" ? "Planned" : "Closed"}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-on-surface">Location</label>
                    <span className="text-[10px] text-outline font-medium">Optional</span>
                  </div>
                  <input className="w-full px-3 py-2 text-xs bg-surface text-on-surface rounded-lg" placeholder="Search place or port..." aria-label="Location" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-on-surface">Website</label>
                  <input className="w-full px-3 py-2 text-xs bg-surface text-on-surface rounded-lg" placeholder="https://" value={website} onChange={(event) => setWebsite(event.target.value)} />
                </div>
              </div>
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-semibold text-on-surface">Price source</label>
                <label className={`relative flex items-start p-3 rounded-xl cursor-pointer ${sourceKind === "petrojam_html" ? "bg-secondary-container/30" : "bg-surface"}`}>
                  <input type="radio" name="price_source" checked={sourceKind === "petrojam_html"} onChange={() => setSourceKind("petrojam_html")} />
                  <span className="ml-3 block text-xs font-bold text-on-secondary-container">Automatic — Petrojam page format</span>
                </label>
                <label className={`relative flex items-start p-3 rounded-xl cursor-pointer ${sourceKind === "manual" ? "bg-secondary-container/30" : "bg-surface"}`}>
                  <input type="radio" name="price_source" checked={sourceKind === "manual"} onChange={() => setSourceKind("manual")} />
                  <span className="ml-3 block text-xs font-medium text-on-surface">Entered by hand</span>
                </label>
              </div>
              <div className="p-3.5 bg-surface-container-low rounded-xl flex items-center justify-between gap-4">
                <div>
                  <span className="block text-xs font-bold text-on-surface">Use as benchmark</span>
                  <span className="block text-[11px] text-on-surface-variant">Only one refinery can be the benchmark. Pump prices are compared against it.</span>
                </div>
                <button type="button" aria-pressed={benchmark} className={`w-11 h-6 rounded-full relative ${benchmark ? "bg-secondary" : "bg-surface-variant"}`} onClick={() => setBenchmark((value) => !value)}>
                  <span className={`w-5 h-5 bg-surface-container-lowest rounded-full absolute top-0.5 ${benchmark ? "right-0.5" : "left-0.5"}`} />
                </button>
              </div>
              {benchmark ? (
                <label className="block text-xs font-semibold text-on-surface">
                  Reason for the benchmark change
                  <input className="mt-1 w-full px-3 py-2 text-xs bg-surface rounded-lg font-normal" value={benchmarkReason} onChange={(event) => setBenchmarkReason(event.target.value)} />
                </label>
              ) : null}
              {error ? <p className="text-xs text-error">{error}</p> : null}
            </form>
            <div className="px-6 py-4 bg-surface-container-low flex items-center justify-between">
              <button type="button" className="text-xs font-semibold text-on-surface-variant px-2 py-1.5" onClick={onClose}>Cancel</button>
              <button type="button" disabled={busy} aria-label={COPY.next} className="bg-secondary text-on-secondary px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5" onClick={() => { void saveRefinery(); }}>
                <span>Continue</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 id="refinery-dialog-title" className="font-semibold text-base text-on-surface">Week's prices</h2>
                <button type="button" title="Close dialog" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
              </div>
              <p className="text-[11px] text-on-surface-variant">Set baseline product prices for the first effective cycle.</p>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="flex items-center justify-between p-3 bg-surface rounded-xl">
                <label className="block text-xs font-semibold text-on-surface">Effective date</label>
                <input type="date" className="bg-surface-container px-3 py-1.5 rounded-lg text-xs font-mono-code" value={date} onChange={(event) => setDate(event.target.value)} />
              </div>
              <div className="text-xs font-mono-code uppercase tracking-wider text-outline font-semibold">Product Rates (JMD)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {catalog.map((product) => {
                  const prior = date === existingWeek ? product.price : null;
                  return (
                    <div key={product.code} className={`p-3 rounded-xl space-y-1 ${prior != null && product.code === "gasolene_87" ? "bg-amber-50/70 md:col-span-2" : "bg-surface"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-on-surface">{product.label}</span>
                        <span className="text-[10px] font-mono-code text-outline">{formatUnit(product.unit)}</span>
                      </div>
                      <input className="w-full px-3 py-1.5 text-xs font-mono-code bg-surface-container-low rounded-lg" inputMode="decimal" aria-label={product.label} value={prices[product.code] || ""} onChange={(event) => setPrices((currentPrices) => ({ ...currentPrices, [product.code]: event.target.value }))} />
                      {prior != null && product.code === "gasolene_87" ? (
                        <p className="text-[11px] text-amber-900">This week already has {formatJmd(prior, 4)}. Saving creates a revision; the old value is kept.</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-on-surface">{COPY.source.slice(0, 25)} <span className="text-error">*</span></label>
                <input className="w-full px-3 py-2 text-xs bg-surface rounded-lg font-mono-code" placeholder="Paste URL link..." value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
                <label className="flex items-center gap-2 p-2 bg-surface-container rounded-lg cursor-pointer text-xs">
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>
                  <span>{fileName || "Upload a document"}</span>
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setFileName(file.name);
                    const reader = new FileReader();
                    reader.onload = () => setFileBody(String(reader.result || "").split(",")[1] || "");
                    reader.readAsDataURL(file);
                  }} />
                </label>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-on-surface">{COPY.reason.slice(0, 6)} <span className="text-error">*</span></label>
                <textarea className="w-full p-2.5 text-xs bg-surface rounded-lg" rows={2} placeholder="Reason for manual price batch entry or revision..." value={reason} onChange={(event) => setReason(event.target.value)} />
              </div>
              {error ? <p className="text-xs text-error">{error}</p> : null}
            </div>
            <div className="px-6 py-4 bg-surface-container-low flex items-center justify-between">
              <button type="button" className="text-xs font-semibold text-secondary flex items-center gap-1" onClick={() => { if (step === 2 && !slug) onClose(); else setCurrent(1); }}>
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Back to Step 1</span>
              </button>
              <button type="button" disabled={busy} className="bg-tertiary text-on-tertiary px-5 py-2 rounded-lg text-xs font-semibold" onClick={() => { void savePrices(); }}>Save prices</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
