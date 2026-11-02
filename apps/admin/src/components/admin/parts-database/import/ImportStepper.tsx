// Stitch: dominion-redesign/parts_import_pick_area
export function ImportStepper({
  step,
  areaName,
  fileName,
}: {
  step: 1 | 2 | 3 | 4;
  areaName?: string;
  fileName?: string;
}) {
  const items = [
    { n: 1, title: "Area", sub: "Select domain", detail: areaName ? `Area Selected: ${areaName}` : undefined },
    { n: 2, title: "Upload", sub: "Source file", detail: fileName ? `Upload ${fileName}` : undefined },
    { n: 3, title: "Check", sub: "Fitment matrix" },
    { n: 4, title: "Done", sub: "Commit cluster" },
  ] as const;
  return (
    <ol className="flex flex-wrap gap-2 text-[11px] font-mono uppercase tracking-wide">
      {items.map((item) => {
        const done = step > item.n;
        const active = step === item.n;
        return (
          <li
            key={item.n}
            className={`rounded-lg px-3 py-2 min-w-[140px] ${active ? "bg-primary text-on-primary" : done ? "bg-tertiary-fixed text-on-tertiary-fixed" : "bg-surface-container-high text-on-surface-variant"}`}
          >
            <div className="font-semibold">{item.n} {item.title} · {item.sub}</div>
            {item.detail ? <div className="normal-case font-sans text-[10px] mt-0.5 opacity-90">{item.detail}</div> : null}
          </li>
        );
      })}
    </ol>
  );
}
