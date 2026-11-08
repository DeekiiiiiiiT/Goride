/** Line drawings for the Fleet everyday screens, in the Stitch export style (soft greys + orange highlight). */

const ORANGE = "#EA580C";

/** Side view of a small car; lights the driven wheels (F3 version cards). */
export function SideCarDrive({ drive }: { drive: "2wd" | "4wd" }) {
  const four = drive === "4wd";
  return (
    <svg viewBox="0 0 240 90" className="h-24 w-full" fill="none" aria-hidden>
      <path d="M30 70 H210" stroke="#CBD5E1" strokeDasharray="4 4" strokeWidth="1.5" />
      <path
        d="M46 60 C48 46 58 38 74 36 L92 22 C96 19 100 18 106 18 H150 C160 18 168 22 174 30 L186 38 C198 40 206 46 208 58 L208 62 H46 Z"
        className="fill-[#E2E8F0] dark:fill-[#3a3a3d]"
      />
      <path d="M100 24 H128 V36 H90 Z" className="fill-white dark:fill-[#2a2a2d]" />
      <path d="M134 24 H156 C162 24 166 28 170 34 L172 36 H134 Z" className="fill-white dark:fill-[#2a2a2d]" />
      {/* rear wheel (left in the drawing), front wheel (right) */}
      <circle cx="78" cy="62" r="12" fill={four ? "#0b1c30" : "#94A3B8"} />
      <circle cx="78" cy="62" r="5" fill="white" />
      <circle cx="176" cy="62" r="12" fill="#0b1c30" />
      <circle cx="176" cy="62" r="5" fill="white" />
      {four ? (
        <>
          <circle cx="78" cy="62" r="17" stroke={ORANGE} strokeDasharray="3 3" strokeWidth="1.5" />
          <circle cx="176" cy="62" r="17" stroke={ORANGE} strokeDasharray="3 3" strokeWidth="1.5" />
          <path d="M95 62 H159" stroke={ORANGE} strokeDasharray="3 3" strokeWidth="2" />
        </>
      ) : (
        <path d="M168 44 H184 M176 44 V40" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * Handbrake cable path seen from above (F7). Labels never sit on a line and never cross the box edge (F-14).
 * No left/right on cables 2 and 3: the maker's catalogue gives numbers only.
 */
export function CablePathDiagram() {
  const line = "#0b1c30";
  return (
    <svg viewBox="0 0 560 170" className="mx-auto block h-auto w-full max-w-[560px] text-[#0b1c30] dark:text-[#fafafa]" fill="none" aria-hidden>
      {/* lever */}
      <rect x="44" y="66" width="34" height="34" rx="8" className="fill-white dark:fill-[#2a2a2d]" stroke="currentColor" strokeWidth="1.5" />
      <path d="M56 92 L68 74" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" />
      <text x="8" y="122" textAnchor="start" fontSize="13" className="fill-[#47464c] dark:fill-[#a1a1aa]">Handbrake lever</text>
      {/* cable 1 */}
      <path d="M78 83 H300" stroke={line} strokeWidth="2.5" className="dark:stroke-[#fafafa]" />
      <rect x="140" y="50" width="78" height="22" rx="11" className="fill-[#0b1c30] dark:fill-[#fafafa]" />
      <text x="179" y="65" textAnchor="middle" fontSize="13" fontWeight="600" className="fill-white dark:fill-[#0b1c30]">Cable 1</text>
      {/* junction */}
      <rect x="300" y="71" width="24" height="24" rx="6" className="fill-[#eff4ff] dark:fill-[#1c1c1e]" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="312" cy="83" r="3" fill="currentColor" />
      {/* cable 2 and 3 */}
      <path d="M324 83 C370 83 380 40 440 40 H470" stroke={line} strokeWidth="2.5" className="dark:stroke-[#fafafa]" />
      <path d="M324 83 C370 83 380 126 440 126 H470" stroke={line} strokeWidth="2.5" className="dark:stroke-[#fafafa]" />
      <text x="400" y="30" textAnchor="middle" fontSize="13" className="fill-[#47464c] dark:fill-[#a1a1aa]">Cable 2</text>
      <text x="400" y="152" textAnchor="middle" fontSize="13" className="fill-[#47464c] dark:fill-[#a1a1aa]">Cable 3</text>
      {/* rear wheels */}
      <rect x="470" y="26" width="60" height="28" rx="8" className="fill-white dark:fill-[#2a2a2d]" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="486" cy="40" r="5" fill={ORANGE} />
      <rect x="470" y="112" width="60" height="28" rx="8" className="fill-white dark:fill-[#2a2a2d]" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="486" cy="126" r="5" fill={ORANGE} />
      <text x="500" y="88" textAnchor="middle" fontSize="13" className="fill-[#47464c] dark:fill-[#a1a1aa]">Rear wheels</text>
    </svg>
  );
}

/** Shock absorber in a dashed circle (F10). */
export function ShockIllustration() {
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 text-[#0b1c30] dark:text-[#fafafa]" fill="none" aria-hidden>
      <circle cx="60" cy="60" r="44" stroke="#CBD5E1" strokeDasharray="4 4" strokeWidth="1.5" />
      <circle cx="60" cy="24" r="6" stroke="currentColor" strokeWidth="3" />
      <path d="M60 30 V40" stroke={ORANGE} strokeWidth="3" />
      <rect x="50" y="40" width="20" height="30" rx="4" fill="currentColor" />
      <path d="M52 48 H68 M52 55 H68 M52 62 H68" stroke="white" strokeWidth="2" className="dark:stroke-[#1c1c1e]" />
      <path d="M60 70 V84" stroke={ORANGE} strokeWidth="3" />
      <circle cx="60" cy="90" r="6" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

/** Generic part tile drawing for cards without a dedicated illustration. */
export function GenericPartGlyph({ icon }: { icon: string }) {
  return (
    <span className="material-symbols-outlined text-[44px] text-[#0b1c30] dark:text-[#fafafa]" aria-hidden>
      {icon}
    </span>
  );
}
