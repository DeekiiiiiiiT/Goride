import type { Board, BoardProduct } from "./refineriesApi";
import { PRODUCT_COLORS, formatChange, formatJmd, formatUnit, formatWeek, sparklinePath } from "./refineryFormat";

function Tile({ product, large }: { product: BoardProduct; large: boolean }) {
  const color = PRODUCT_COLORS[product.code] || "#64748b";
  const path = sparklinePath(product.sparkline || []);
  const change = formatChange(product.change, product.changePct, product.prevWeek);
  return (
    <div className={`bg-surface-container-lowest border border-surface-variant/80 rounded-xl shadow-xs ${large ? "p-4 flex flex-col justify-between" : "p-3"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`${large ? "text-xs font-semibold" : "text-xs font-medium"} text-on-surface`}>{product.label}</span>
          {product.revision ? (
            <span className="relative group">
              <span className="bg-amber-100 text-amber-800 text-[10px] font-medium px-1.5 py-0.5 rounded cursor-help">Revised</span>
              <span className="hidden group-hover:block absolute left-0 bottom-full mb-1 z-20 w-44 bg-surface-container-highest text-on-surface text-[10px] font-mono-code p-2 rounded shadow-md border border-surface-variant">
                Revised {formatWeek(product.revision.revisedAt)} · was {formatJmd(product.revision.previous, 2)}
              </span>
            </span>
          ) : null}
        </div>
        <span className={`${large ? "text-[11px]" : "text-[10px] italic"} text-outline font-normal`}>{formatUnit(product.unit)}</span>
      </div>
      <div className={`font-mono-code font-normal text-on-surface tabular-nums ${large ? "text-2xl mt-2" : "text-base mt-1"}`}>{formatJmd(product.price, 2)}</div>
      <div className={`font-mono-code text-on-surface-variant tabular-nums ${large ? "text-[11px] mt-1 flex items-center gap-1" : "text-[10px] mt-0.5"}`}>
        <span className="sr-only">{product.change != null && product.change < 0 ? "down" : product.change != null && product.change > 0 ? "up" : "unchanged"}</span>
        <span>{change}</span>
      </div>
      {large ? (
        <div className="mt-4 pt-2">
          <svg className="w-full h-7 overflow-visible" fill="none" viewBox="0 0 100 24" aria-hidden>
            {path ? <path d={path} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" /> : null}
          </svg>
          <div className="mt-3">
            <div className="w-full h-1 bg-surface-container rounded-full relative">
              {product.markerPct != null ? <div className="absolute -top-0.5 w-2 h-2 rounded-full bg-secondary -ml-1" style={{ left: `${product.markerPct}%` }} /> : null}
            </div>
            <div className="flex justify-between font-mono-code text-[10px] text-outline mt-1.5 tabular-nums">
              <span>52w low {formatJmd(product.low52, 2)}</span>
              <span>high {formatJmd(product.high52, 2)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PriceBoard({
  board,
  onWeek,
}: {
  board: Board;
  onWeek: (week: string) => void;
}) {
  const weeks = [...(board.weeks || [])].sort();
  const index = weeks.indexOf((board.week || "").slice(0, 10));
  const motor = board.products.filter((product) => product.boardGroup === "motor");
  const other = board.products.filter((product) => product.boardGroup === "other");
  const empty = board.products.every((product) => product.price == null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-on-surface tracking-tight">Ex-refinery prices</h2>
          <span className="font-mono-code text-[11px] uppercase tracking-wider text-outline font-medium">Motor fuels</span>
        </div>
        <div className="flex items-center gap-2 bg-surface-container-lowest border border-surface-variant/80 rounded-lg p-1 text-xs font-mono-code text-on-surface shadow-xs">
          <button type="button" className="p-1 text-outline hover:text-on-surface rounded hover:bg-surface-container" aria-label="chevron_left" disabled={index <= 0} onClick={() => index > 0 && onWeek(weeks[index - 1])}>
            <span className="material-symbols-outlined text-sm leading-none">chevron_left</span>
          </button>
          <label className="flex items-center gap-1.5 px-2">
            <span className="material-symbols-outlined text-xs text-outline">calendar_today</span>
            <span className="sr-only">Week</span>
            <select className="bg-transparent font-medium text-[11px] tabular-nums" aria-label="Week of" value={board.week || ""} onChange={(event) => onWeek(event.target.value)}>
              {weeks.map((week) => <option key={week} value={week.slice(0, 10)}>Week of {formatWeek(week)}</option>)}
            </select>
          </label>
          <button type="button" className="p-1 text-outline hover:text-on-surface rounded hover:bg-surface-container disabled:text-outline-variant disabled:cursor-not-allowed" aria-label="chevron_right" disabled={index < 0 || index >= weeks.length - 1} onClick={() => index >= 0 && index < weeks.length - 1 && onWeek(weeks[index + 1])}>
            <span className="material-symbols-outlined text-sm leading-none">chevron_right</span>
          </button>
        </div>
      </div>
      {empty ? (
        <div className="bg-surface-container-lowest border border-surface-variant/80 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-semibold text-on-surface">No prices yet</div>
          <p className="text-[11px] text-outline mt-1">Data is not in yet for this cycle.</p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {motor.map((product) => <div key={product.code}><Tile product={product} large /></div>)}
          </dl>
          <div>
            <span className="font-mono-code text-[11px] uppercase tracking-wider text-outline font-medium block mb-2">Other products</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {other.map((product) => <Tile key={product.code} product={product} large={false} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
