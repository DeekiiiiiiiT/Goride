// Stitch: find_parts_front_or_back — top-down axle blueprint (axle + side aware)
type Axle = "front" | "rear" | "both";
type Side = "left" | "right" | "both";
type Corner = "fl" | "fr" | "rl" | "rr";

const ACTIVE = "#0153dc";
const MUTED = "#737686";
const WHEEL = "#191b24";
const WHEEL_MUTED = "#434655";

function cornerActive(axle: Axle, side: Side, corner: Corner) {
  const onFront = corner === "fl" || corner === "fr";
  const axleOk = onFront ? axle === "front" || axle === "both" : axle === "rear" || axle === "both";
  if (!axleOk) return false;
  if (side === "both") return true;
  if (side === "left") return corner === "fl" || corner === "rl";
  return corner === "fr" || corner === "rr";
}

function axleSegment(axle: Axle, side: Side, which: "front" | "rear") {
  const axleOk = which === "front" ? axle === "front" || axle === "both" : axle === "rear" || axle === "both";
  if (!axleOk) return { active: false, x1: 28, x2: 212 };
  if (side === "both") return { active: true, x1: 28, x2: 212 };
  if (side === "left") return { active: true, x1: 28, x2: 120 };
  return { active: true, x1: 120, x2: 212 };
}

function wheelStyle(on: boolean) {
  return {
    stroke: on ? ACTIVE : MUTED,
    fill: on ? ACTIVE : WHEEL_MUTED,
    caliper: on ? "#ced8ff" : "#ededf9",
    strokeW: on ? 1.5 : 1,
    opacity: on ? 1 : 0.55,
  };
}

export function AxleGeometryDiagram({ highlight, side }: { highlight: Axle; side: Side }) {
  const fl = wheelStyle(cornerActive(highlight, side, "fl"));
  const fr = wheelStyle(cornerActive(highlight, side, "fr"));
  const rl = wheelStyle(cornerActive(highlight, side, "rl"));
  const rr = wheelStyle(cornerActive(highlight, side, "rr"));
  const frontSeg = axleSegment(highlight, side, "front");
  const rearSeg = axleSegment(highlight, side, "rear");
  const frontAxleOn = frontSeg.active;
  const rearAxleOn = rearSeg.active;
  const frontTagOn = cornerActive(highlight, side, "fl") || cornerActive(highlight, side, "fr");
  const rearTagOn = cornerActive(highlight, side, "rl") || cornerActive(highlight, side, "rr");

  return (
    <div className="relative py-space-md px-space-sm flex items-center justify-center bg-surface rounded-xl overflow-hidden min-h-[360px]">
      <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#40465e_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="relative w-full max-w-[290px] h-[360px] flex items-center justify-center">
        <svg className="w-full h-full text-surface-container-highest" fill="none" viewBox="0 0 240 380" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path
            d="M 60 40 C 80 18, 160 18, 180 40 C 198 62, 204 110, 204 165 C 204 220, 206 280, 194 330 C 186 362, 164 370, 120 370 C 76 370, 54 362, 46 330 C 34 280, 36 220, 36 165 C 36 110, 42 62, 60 40 Z"
            fill="currentColor"
            fillOpacity="0.55"
            stroke="#737686"
            strokeDasharray="4 2"
            strokeWidth="1.75"
          />
          <path
            d="M 66 110 C 84 96, 156 96, 174 110 C 184 140, 186 215, 174 246 C 156 256, 84 256, 66 246 C 54 215, 56 140, 66 110 Z"
            fill="#ededf9"
            fillOpacity="0.85"
            stroke="#737686"
            strokeWidth="1.2"
          />
          <line opacity="0.4" stroke="#737686" strokeDasharray="3 3" strokeWidth="1" x1="120" x2="120" y1="28" y2="360" />
          <line
            stroke={frontAxleOn ? ACTIVE : MUTED}
            strokeLinecap="round"
            strokeWidth={frontAxleOn ? 3 : 2.5}
            opacity={frontAxleOn ? 1 : 0.5}
            x1={frontSeg.x1}
            x2={frontSeg.x2}
            y1="92"
            y2="92"
          />
          {frontAxleOn && side === "both" ? <circle cx="120" cy="92" fill={ACTIVE} r="5" /> : null}
          <rect fill={WHEEL} height="44" opacity={fl.opacity} rx="3" stroke={fl.stroke} strokeWidth={fl.strokeW} width="18" x="18" y="70" />
          <rect fill={fl.fill} height="30" opacity={fl.opacity} rx="1" width="5" x="25" y="77" />
          <path d="M 23 83 L 34 83 L 34 101 L 23 101 Z" fill={fl.caliper} opacity={fl.opacity} stroke={fl.stroke} strokeWidth={fl.strokeW} />
          <rect fill={WHEEL} height="44" opacity={fr.opacity} rx="3" stroke={fr.stroke} strokeWidth={fr.strokeW} width="18" x="204" y="70" />
          <rect fill={fr.fill} height="30" opacity={fr.opacity} rx="1" width="5" x="210" y="77" />
          <path d="M 206 83 L 217 83 L 217 101 L 206 101 Z" fill={fr.caliper} opacity={fr.opacity} stroke={fr.stroke} strokeWidth={fr.strokeW} />
          <line
            stroke={rearAxleOn ? ACTIVE : MUTED}
            strokeLinecap="round"
            strokeWidth={rearAxleOn ? 3 : 2.5}
            opacity={rearAxleOn ? 1 : 0.5}
            x1={rearSeg.x1}
            x2={rearSeg.x2}
            y1="295"
            y2="295"
          />
          <rect fill={WHEEL_MUTED} height="40" opacity={rl.opacity} rx="3" stroke={rl.stroke} strokeWidth={rl.strokeW} width="18" x="18" y="275" />
          <circle cx="27" cy="295" fill="#ededf9" opacity={rl.opacity} r="7" stroke={rl.stroke} strokeWidth={rl.strokeW} />
          <rect fill={WHEEL_MUTED} height="40" opacity={rr.opacity} rx="3" stroke={rr.stroke} strokeWidth={rr.strokeW} width="18" x="204" y="275" />
          <circle cx="213" cy="295" fill="#ededf9" opacity={rr.opacity} r="7" stroke={rr.stroke} strokeWidth={rr.strokeW} />
        </svg>
        <div className={"absolute -top-1 left-2 flex items-center gap-1.5 px-2 py-1 rounded shadow-sm font-label-xs text-label-xs uppercase " + (frontTagOn ? "bg-primary-container text-on-primary" : "bg-surface-container-high text-on-surface-variant")}>
          <span className="material-symbols-outlined text-[14px]">disc_full</span>
          <span>Front axle (disc brakes)</span>
        </div>
        <div className={"absolute bottom-1 right-2 flex items-center gap-1.5 px-2 py-1 rounded shadow-sm font-label-xs text-label-xs uppercase " + (rearTagOn ? "bg-primary-container text-on-primary" : "bg-surface-container-high text-on-surface-variant")}>
          <span className="material-symbols-outlined text-[14px]">adjust</span>
          <span>Rear axle (drum / shoes)</span>
        </div>
      </div>
    </div>
  );
}
