/** Chassis diagram from find-parts-position.html (Stitch FP4). */
export function Fp4VehicleDiagram({ frontActive }: { frontActive?: boolean }) {
  return (
    <svg className="h-full max-h-[300px] w-full" fill="none" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg">
      <path
        className="text-surface-container-highest"
        d="M 64 36 C 84 32, 156 32, 176 36 C 188 40, 196 64, 198 100 C 200 138, 200 230, 198 270 C 196 288, 186 294, 168 296 C 140 298, 100 298, 72 296 C 54 294, 44 288, 42 270 C 40 230, 40 138, 42 100 C 44 64, 52 40, 64 36 Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        className="text-surface-container-high"
        d="M 68 86 C 88 80, 152 80, 172 86 C 176 104, 178 120, 180 128 C 120 125, 120 125, 60 128 C 62 120, 64 104, 68 86 Z"
        fill="currentColor"
        opacity="0.45"
      />
      <path
        className="text-surface-container-high"
        d="M 64 262 C 90 264, 150 264, 176 262 C 174 274, 172 282, 170 286 C 140 288, 100 288, 70 286 C 68 282, 66 274, 64 262 Z"
        fill="currentColor"
        opacity="0.35"
      />
      <line className="text-surface-container-highest" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1" x1="120" x2="120" y1="24" y2="300" />
      <g>
        <line className={frontActive ? "text-outline-variant" : "text-primary"} stroke="currentColor" strokeWidth={frontActive ? 2 : 3} x1="32" x2="208" y1="240" y2="240" />
        <rect className="text-outline-variant" height="36" rx="4" stroke="currentColor" strokeWidth="1.5" width="16" x="24" y="222" />
        <rect className="text-outline-variant" height="36" rx="4" stroke="currentColor" strokeWidth="1.5" width="16" x="200" y="222" />
      </g>
      <g>
        <line className={frontActive ? "text-primary" : "text-outline-variant"} stroke="currentColor" strokeWidth={frontActive ? 3 : 2} x1="32" x2="208" y1="92" y2="92" />
        <rect className={frontActive ? "text-primary" : "text-outline-variant"} height="36" rx="4" stroke="currentColor" strokeWidth="1" width="16" x="24" y="74" />
        <rect className={frontActive ? "text-primary" : "text-outline-variant"} height="36" rx="4" stroke="currentColor" strokeWidth="1" width="16" x="200" y="74" />
        {frontActive ? (
          <>
            <circle className="text-primary" cx="32" cy="92" fill="none" r="14" stroke="currentColor" strokeDasharray="2 2" strokeWidth="1.5" />
            <circle className="fill-primary" cx="32" cy="92" r="4" />
            <circle className="text-primary" cx="208" cy="92" fill="none" r="14" stroke="currentColor" strokeDasharray="2 2" strokeWidth="1.5" />
            <circle className="fill-primary" cx="208" cy="92" r="4" />
          </>
        ) : null}
      </g>
    </svg>
  );
}
