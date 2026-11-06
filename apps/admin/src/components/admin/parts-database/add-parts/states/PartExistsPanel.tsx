import { MaterialIcon } from "../../import/MaterialIcon";

export function PartExistsPanel({
  label,
  onAddMore,
  onDifferent,
  showDetailsTable,
  existingNumber,
  existingBrand,
  provenanceLine,
  fitmentLine,
}: {
  label: string;
  onAddMore: () => void;
  onDifferent: () => void;
  showDetailsTable?: boolean;
  existingNumber?: string;
  existingBrand?: string;
  provenanceLine?: string;
  fitmentLine?: string;
}) {
  return (
    <div className="rounded-xl border border-amber-400/50 bg-[#fff8e6] dark:bg-amber-500/10 dark:border-amber-500/40 p-space-lg flex flex-col gap-space-md shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#f3d791] dark:bg-amber-500/50" />
      <div className="flex flex-col gap-space-md">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#faeed1] dark:bg-amber-500/20 text-[#b45309] dark:text-amber-200 flex items-center justify-center">
              <MaterialIcon name="content_copy" className="text-[20px]" />
            </span>
            <span className="font-mono-sm font-semibold uppercase tracking-wider text-[#b45309] dark:text-amber-200">Duplicate conflict</span>
          </div>
        </div>
        <div>
          <p className="font-headline-md text-headline-md text-on-surface">Part already exists in master</p>
          <p className="font-body-sm text-on-surface-variant mt-1">{label}</p>
        </div>
        {showDetailsTable && (existingNumber || existingBrand || provenanceLine || fitmentLine) ? (
          <div className="bg-surface-container-low rounded-lg p-space-sm flex flex-col gap-1.5">
            {existingNumber ? (
              <div className="flex items-center justify-between font-mono-sm">
                <span className="text-outline">EXISTING SKU</span>
                <span className="font-semibold text-on-surface">{existingNumber}</span>
              </div>
            ) : null}
            {existingBrand ? (
              <div className="flex items-center justify-between font-mono-sm">
                <span className="text-outline">BRAND / MAKER</span>
                <span className="text-on-surface">{existingBrand}</span>
              </div>
            ) : null}
            {provenanceLine ? (
              <div className="flex items-center justify-between font-mono-sm">
                <span className="text-outline">PROVENANCE LOG</span>
                <span className="text-on-surface">{provenanceLine}</span>
              </div>
            ) : null}
            {fitmentLine ? (
              <div className="flex items-center justify-between font-mono-sm pt-1">
                <span className="text-outline">CURRENT FITMENTS</span>
                <span className="text-primary font-medium">{fitmentLine}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <button type="button" className="whitespace-nowrap px-4 h-10 rounded-lg bg-primary-container text-on-primary font-label-md font-semibold shadow-sm inline-flex items-center justify-center gap-1.5 shrink-0" onClick={onAddMore}>
          <MaterialIcon name="add_link" className="text-[16px]" />
          Add more cars to it
        </button>
        <button type="button" className="whitespace-nowrap px-4 h-10 rounded-lg border border-outline-variant/60 bg-surface-container-lowest font-label-md shrink-0" onClick={onDifferent}>
          It&apos;s a different part
        </button>
      </div>
    </div>
  );
}
