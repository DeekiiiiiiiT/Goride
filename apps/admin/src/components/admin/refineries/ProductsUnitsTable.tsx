import { useState } from "react";
import { refineriesApi, type BoardProduct } from "./refineriesApi";

export function ProductsUnitsTable({
  products,
  canWrite,
  onSaved,
}: {
  products: BoardProduct[];
  canWrite: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const missing = products.filter((product) => !product.unit).length;
  return (
    <div className="bg-surface-container-lowest border border-surface-variant/80 rounded-xl shadow-xs overflow-hidden">
      <button type="button" className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-surface-container-low text-left" onClick={() => setOpen((value) => !value)}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-on-surface">Products & units</span>
          <span className="text-outline text-xs">·</span>
          <span className="text-xs text-outline font-mono-code">{products.length} products · {missing} without a unit</span>
        </div>
        <span className="material-symbols-outlined text-outline text-sm">{open ? "expand_less" : "expand_more"}</span>
      </button>
      {open ? (
        <table className="w-full text-left text-xs">
          <thead className="text-outline">
            <tr>
              <th className="px-5 py-2 font-normal">Product</th>
              <th className="px-3 py-2 font-normal">Code</th>
              <th className="px-3 py-2 font-normal">Unit</th>
              <th className="px-3 py-2 font-normal">Price Engine grade</th>
              <th className="px-3 py-2 font-normal">On the board</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.code} className="border-t border-surface-container">
                <td className="px-5 py-2">
                  {canWrite ? (
                    <input className="bg-surface rounded px-2 py-1" defaultValue={product.label} onBlur={(event) => {
                      if (event.target.value !== product.label) {
                        void refineriesApi.patchProduct(product.code, { label: event.target.value }).then(onSaved);
                      }
                    }} />
                  ) : product.label}
                </td>
                <td className="px-3 py-2 font-mono-code">{product.code}</td>
                <td className="px-3 py-2">
                  {canWrite ? (
                    <input className="bg-surface rounded px-2 py-1" placeholder="unit not set" defaultValue={product.unit || ""} onBlur={(event) => {
                      if ((event.target.value || null) !== product.unit) {
                        void refineriesApi.patchProduct(product.code, { unit: event.target.value }).then(onSaved);
                      }
                    }} />
                  ) : (product.unit || "unit not set")}
                </td>
                <td className="px-3 py-2 font-mono-code">{product.engineGrade || "—"}</td>
                <td className="px-3 py-2">{product.boardGroup === "motor" || product.boardGroup === "other" ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
