/** Optional “On their site this is called…” for buyer parity. */

export function SourceLabelField({
  value,
  onChange,
  step,
  onStepChange,
}: {
  value?: string;
  onChange: (value: string) => void;
  step?: number;
  onStepChange?: (step: number) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block text-xs text-[#5f75a5]">
        On their site this is called…
        <input
          className="mt-1 w-full rounded border border-[#d7e0f2] bg-white px-2 py-1.5 text-sm text-[#0f172a] outline-none"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Exact restaurant wording"
        />
      </label>
      {onStepChange ? (
        <label className="block text-xs text-[#5f75a5]">
          Builder step #
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded border border-[#d7e0f2] bg-white px-2 py-1.5 text-sm text-[#0f172a] outline-none"
            value={step ?? ''}
            onChange={(e) => onStepChange(Number(e.target.value) || 1)}
          />
        </label>
      ) : null}
    </div>
  );
}
