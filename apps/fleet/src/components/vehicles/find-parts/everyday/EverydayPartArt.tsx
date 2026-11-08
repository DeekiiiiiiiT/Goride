export type PartArtKind = "pad" | "caliper" | "shoes" | "shock" | "disc" | "cable" | "generic";

export function EverydayPartArt({ kind, className = "" }: { kind: PartArtKind; className?: string }) {
  const base = `shrink-0 text-[#64748b] ${className}`;
  if (kind === "pad") {
    return (
      <svg viewBox="0 0 80 80" className={`h-20 w-20 ${base}`} aria-hidden>
        <rect x="12" y="28" width="56" height="24" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 36h8M52 36h8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === "caliper") {
    return (
      <svg viewBox="0 0 80 80" className={`h-20 w-20 ${base}`} aria-hidden>
        <rect x="24" y="20" width="32" height="40" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="40" cy="52" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === "shoes") {
    return (
      <svg viewBox="0 0 80 80" className={`h-20 w-20 ${base}`} aria-hidden>
        <path d="M20 50 Q40 20 60 50" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="28" y1="44" x2="52" y2="44" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === "shock") {
    return (
      <svg viewBox="0 0 80 80" className={`h-20 w-20 ${base}`} aria-hidden>
        <rect x="36" y="16" width="8" height="48" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="30" y="14" width="20" height="6" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === "cable") {
    return (
      <svg viewBox="0 0 80 80" className={`h-20 w-20 ${base}`} aria-hidden>
        <path d="M16 40 Q40 16 64 40" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 80 80" className={`h-20 w-20 ${base}`} aria-hidden>
      <rect x="20" y="20" width="40" height="40" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function HandbrakeCablePath({ className = "" }: { className?: string }) {
  const stroke = "#64748b";
  const cableY = 88;
  const wheelY = 88;
  return (
    <svg
      viewBox="0 0 560 160"
      className={`mx-auto block h-auto w-[560px] max-w-full text-[#64748b] ${className}`}
      aria-hidden
    >
      {/* Handbrake lever */}
      <rect x="20" y="58" width="32" height="40" rx="4" fill="none" stroke={stroke} strokeWidth="1.5" />
      <text x="36" y="148" textAnchor="middle" fontSize="13" fill={stroke}>
        Handbrake lever
      </text>
      {/* Cable 1 — long run to split */}
      <path
        d={`M52 ${cableY} H270 Q310 56 350 ${cableY} H390`}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <text x="220" y="68" textAnchor="middle" fontSize="13" fill={stroke}>
        Cable 1
      </text>
      {/* Branch to rear wheels */}
      <path d={`M390 ${cableY} H430`} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <path d={`M430 ${cableY} V72`} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <path d={`M430 72 H490`} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <path d="M430 72 V104" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <path d="M430 104 H490" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="462" cy={wheelY} rx="18" ry="14" fill="none" stroke={stroke} strokeWidth="1.5" />
      <ellipse cx="518" cy={wheelY} rx="18" ry="14" fill="none" stroke={stroke} strokeWidth="1.5" />
      <text x="490" y="56" textAnchor="middle" fontSize="13" fill={stroke}>
        Rear wheels
      </text>
      <text x="462" y="128" textAnchor="middle" fontSize="13" fill={stroke}>
        Cable 2
      </text>
      <text x="518" y="128" textAnchor="middle" fontSize="13" fill={stroke}>
        Cable 3
      </text>
    </svg>
  );
}
