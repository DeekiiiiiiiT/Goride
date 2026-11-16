/**
 * Log service look, taken from the Stitch exports in docs/stitch/powertrain-job-fit-fleet/html/ (01–10).
 * The app theme uses the same token names with different values (grey surfaces), so Stitch's own colours
 * are written here as hex, each with a dark-mode pair. Only the look lives here.
 */
export const LS = {
  /* Surfaces (Stitch: lavender, not the app's grey). */
  lowest: "bg-white dark:bg-[#15161d]",
  low: "bg-[#f4f2fd] dark:bg-[#1c1d26]",
  mid: "bg-[#eeedf7] dark:bg-[#23242e]",
  high: "bg-[#e8e7f1] dark:bg-[#2a2b36]",
  highest: "bg-[#e3e1ec] dark:bg-[#32333e]",
  hoverLow: "hover:bg-[#f4f2fd] dark:hover:bg-[#1c1d26]",
  hoverMid: "hover:bg-[#eeedf7] dark:hover:bg-[#23242e]",
  hoverHigh: "hover:bg-[#e8e7f1] dark:hover:bg-[#2a2b36]",
  /* Text. */
  text: "text-[#1a1b22] dark:text-[#e4e1ec]",
  muted: "text-[#47464c] dark:text-[#c9c5cd]",
  outline: "text-[#78767d] dark:text-[#938f99]",
  /* Car card (primary-container) and the mint pill (secondary). */
  navy: "bg-[#1b192e] text-white",
  navyTile: "bg-[#2f3038]",
  onNavySoft: "text-[#f1effa]/80",
  mintPill: "bg-[#006c4a] text-[#85f8c4]",
  mintDone: "bg-[#82f5c1] text-[#00714e]",
  mintLine: "bg-[#82f5c1]",
  /* Header tile (tertiary-fixed). */
  peachTile: "bg-[#ffdcc3] text-[#c76c00]",
  /* Buttons. */
  btnCancel: "bg-[#ffdad6]/40 text-[#ba1a1a] hover:bg-[#ffdad6] hover:text-[#93000a] dark:bg-[#93000a]/30 dark:text-[#ffb4ab]",
  btnBack: "bg-[#eeedf7] text-[#1a1b22] hover:bg-[#e8e7f1] dark:bg-[#23242e] dark:text-[#e4e1ec] dark:hover:bg-[#2a2b36]",
  btnPrimary: "bg-black text-white dark:bg-white dark:text-black",
  green: "text-[#006c4a] dark:text-[#68dba9]",
} as const;

/** Stitch type scale. */
export const LT = {
  headlineMd: "text-[20px] leading-7 tracking-[-0.02em] font-semibold",
  titleMd: "text-[16px] leading-6 tracking-[-0.015em] font-semibold",
  titleSm: "text-[14px] leading-5 tracking-[-0.01em] font-semibold",
  bodyMd: "text-[14px] leading-5 tracking-[-0.005em]",
  bodySm: "text-[13px] leading-[18px]",
  labelMd: "text-[12px] leading-4 tracking-[0.01em] font-medium",
  labelSm: "text-[11px] leading-[14px] tracking-[0.03em] font-semibold",
} as const;

/** "Toyota Roomy (2019) 5179KZ" → name + plate, so the plate gets its own chip as in Stitch. */
export function splitPlate(label: string): { name: string; plate: string | null } {
  const m = /^(.*?)[\s·]+([A-Z0-9-]{4,9})$/.exec(label.trim());
  return m && /\d/.test(m[2]) ? { name: m[1].trim(), plate: m[2] } : { name: label, plate: null };
}
