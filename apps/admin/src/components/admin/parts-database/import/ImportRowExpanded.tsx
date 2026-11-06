// Stitch: dominion-redesign/parts_import_check_results
import { PartsButton } from "../PartsButton";

export function ImportRowExpanded({
  issues,
  onCheckRow,
}: {
  issues: Array<{ code?: string; message?: string }>;
  onCheckRow?: () => void;
}) {
  const code = issues[0]?.code;
  if (code === "DISAMBIGUATION_REQ") {
    return (
      <div className="p-3 bg-surface-container-low text-xs space-y-1">
        <p className="font-semibold">DISAMBIGUATION REQUIRED: FIELD [VEHICLE]</p>
        <p>{issues[0]?.message}</p>
        <label className="block mt-2">
          Manual override UUID
          <input className="w-full mt-1 rounded border border-outline-variant px-2 py-1 font-mono text-xs" placeholder="vehicle_catalog id" />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <PartsButton variant="secondary" className="text-xs min-h-[32px] h-8" onClick={onCheckRow}>Check row</PartsButton>
          <PartsButton variant="secondary" className="text-xs min-h-[32px] h-8">Use this one</PartsButton>
          <PartsButton variant="secondary" className="text-xs min-h-[32px] h-8">Fix inline</PartsButton>
        </div>
      </div>
    );
  }
  if (code === "DIFFERS_FROM_CONFIRMED") {
    return <p className="p-3 text-xs bg-surface-container-low">Differs from confirmed catalog record — fit only</p>;
  }
  return (
    <div className="p-3 bg-surface-container-low text-xs space-y-1">
      <p className="font-semibold">Diagnostic note</p>
      <p>{issues[0]?.message ?? "No extra detail"}</p>
      <PartsButton variant="secondary" className="text-xs min-h-[32px] h-8">Dismiss inspector</PartsButton>
    </div>
  );
}
