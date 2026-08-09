import { ReactNode, useState } from 'react';

type Props = {
  children: ReactNode;
  summary?: string;
  hint?: string;
  /** Open by default — usually false for floor posture. */
  defaultOpen?: boolean;
};

/** One-tap desk fields under the scan hero. */
export function ScanDetailsDisclosure({
  children,
  summary = 'Details',
  hint,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="group rounded-xl border border-slate-200 bg-white open:shadow-sm"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-slate-400 transition group-open:rotate-90" aria-hidden>
            ▸
          </span>
          {summary}
          {hint ? (
            <span className="text-xs font-normal text-slate-500">— {hint}</span>
          ) : null}
        </span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-4">{children}</div>
    </details>
  );
}
