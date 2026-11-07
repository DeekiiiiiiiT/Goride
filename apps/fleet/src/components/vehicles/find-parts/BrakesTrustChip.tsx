export function BrakesTrustChip({ trust }: { trust: string }) {
  const confirmed = trust === "Confirmed";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-caption text-caption font-semibold ${
        confirmed
          ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
          : "bg-amber-500/15 text-amber-900 dark:text-amber-100"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${confirmed ? "bg-emerald-600" : "bg-amber-500"}`} />
      {confirmed ? "Confirmed" : "Needs checking"}
    </span>
  );
}
