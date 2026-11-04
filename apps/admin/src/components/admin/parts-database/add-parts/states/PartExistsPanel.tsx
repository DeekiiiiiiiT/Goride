export function PartExistsPanel({
  label,
  onAddMore,
  onDifferent,
}: {
  label: string;
  onAddMore: () => void;
  onDifferent: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-col gap-2 font-body-sm">
      <p className="font-semibold text-amber-900">This part is already in the database</p>
      <p className="text-amber-800">{label}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="px-3 h-9 rounded-lg bg-primary-container text-on-primary font-semibold" onClick={onAddMore}>Add more cars to it</button>
        <button type="button" className="px-3 h-9 rounded-lg border border-amber-400" onClick={onDifferent}>It&apos;s a different part</button>
      </div>
    </div>
  );
}
