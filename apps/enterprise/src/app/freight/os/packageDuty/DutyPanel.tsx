type DutyView = {
  aboveThreshold: boolean;
  cifUsd: number;
  importDutyUsd: number;
  scfUsd: number;
  envUsd: number;
  gctUsd: number;
  stampJmd: number;
  cafJmd: number;
  totalDutyUsd: number;
};

type Props = {
  dutyView: DutyView | null;
  computePending: boolean;
  computeError?: Error | null;
  onRecalculate: () => void;
};

export function DutyPanel({
  dutyView,
  computePending,
  computeError,
  onRecalculate,
}: Props) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={computePending}
          onClick={onRecalculate}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Recalculate duty
        </button>
      </div>
      {computeError && (
        <p className="mt-2 text-xs text-red-700">{computeError.message}</p>
      )}
      {!dutyView ? (
        <p className="mt-3 text-sm text-slate-500">
          No duty snapshot yet — recalculate after invoice + value are set.
        </p>
      ) : (
        <>
          {dutyView.aboveThreshold ? (
            <p className="mt-2 text-xs text-amber-800">CIF above US$100 tax-free threshold</p>
          ) : (
            <p className="mt-2 text-xs text-green-700">
              CIF ≤ US$100 — primary import taxes waived
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <tbody>
                {(
                  [
                    ['CIF', dutyView.cifUsd],
                    ['Import Duty', dutyView.importDutyUsd],
                    ['SCF 0.3%', dutyView.scfUsd],
                    ['ENV 0.5%', dutyView.envUsd],
                    ['GCT 15%', dutyView.gctUsd],
                    ['Stamp (J$)', dutyView.stampJmd],
                    ['CAF (J$)', dutyView.cafJmd],
                  ] as const
                ).map(([label, val]) => (
                  <tr key={label} className="border-t border-slate-100">
                    <td className="py-2 text-slate-600">{label}</td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {label.includes('J$') ? `J$${val.toFixed(0)}` : `US$${val.toFixed(2)}`}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 font-semibold">
                  <td className="py-2">Total duty (USD equiv.)</td>
                  <td className="py-2 text-right font-mono">
                    US${dutyView.totalDutyUsd.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
