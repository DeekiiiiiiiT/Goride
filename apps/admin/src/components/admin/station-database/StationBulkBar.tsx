import { StationIcon } from "./StationIcon";

export function StationBulkBar({
  count,
  brands,
  reason,
  onReason,
  onBrand,
  onPin,
  onVerify,
  onDuplicate,
  onExport,
  onClear,
}: {
  count: number;
  brands: { id: string; name: string }[];
  reason: string;
  onReason: (value: string) => void;
  onBrand: (brandId: string) => void;
  onPin: () => void;
  onVerify: () => void;
  onDuplicate: (keepId: string) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  if (!count) return null;
  return (
    <div className="sticky bottom-3 z-30 mx-4 my-2 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-3 shadow-floating border border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-blue-600/30 border border-blue-500/50 text-blue-300 px-3 py-1.5 rounded-xl font-mono font-bold shadow-inner">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span>{count} SELECTED</span>
        </div>
        <input
          className="hidden sm:block bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-400 px-3 py-1.5 rounded-xl text-xs min-w-[180px]"
          placeholder="Reason for change"
          value={reason}
          onChange={(event) => onReason(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl font-semibold shadow-sm"
          defaultValue=""
          onChange={(event) => { if (event.target.value) onBrand(event.target.value); event.target.value = ""; }}
        >
          <option value="">Set brand</option>
          {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
        <button type="button" className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-xl font-semibold transition-all flex items-center gap-1.5" onClick={onPin}>
          <StationIcon name="pin_drop" className="text-[15px]" />Mark pin checked
        </button>
        <button type="button" className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-sm shadow-emerald-600/25 flex items-center gap-1.5" onClick={onVerify}>
          <StationIcon name="verified" className="text-[15px]" />Verify selected
        </button>
        <button type="button" className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-sm flex items-center gap-1.5" onClick={() => {
          const keepId = window.prompt("Station id to keep") || "";
          if (keepId) onDuplicate(keepId);
        }}>
          <StationIcon name="call_merge" className="text-[15px]" />Mark duplicate of…
        </button>
        <button type="button" className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-xl font-medium transition-all" onClick={onExport}>
          Export selected
        </button>
        <button type="button" className="text-slate-400 hover:text-white px-2 py-1 font-semibold transition-colors" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}
