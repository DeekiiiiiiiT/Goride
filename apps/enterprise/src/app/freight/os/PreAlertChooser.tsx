import type { ReactNode } from 'react';
import { FileSpreadsheet, FileText, Keyboard } from 'lucide-react';

export type PreAlertEntry = 'invoice' | 'csv' | 'manual';

/** First screen of Create pre-alert — three large tap targets. */
export function PreAlertChooser({
  onPick,
}: {
  onPick: (entry: PreAlertEntry) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3">
        <ChooserCard
          icon={<FileText className="h-6 w-6" aria-hidden />}
          title="Upload invoice"
          hint="I have an Amazon / Shein PDF"
          example="We’ll fill the order, then ask for tracking."
          onClick={() => onPick('invoice')}
        />
        <ChooserCard
          icon={<FileSpreadsheet className="h-6 w-6" aria-hidden />}
          title="Upload CSV"
          hint="Many packages at once"
          example="20 tracking numbers in a spreadsheet."
          onClick={() => onPick('csv')}
        />
        <ChooserCard
          icon={<Keyboard className="h-6 w-6" aria-hidden />}
          title="Add manually"
          hint="No file, type it in"
          example="Walk-in with a label."
          onClick={() => onPick('manual')}
        />
      </div>
    </div>
  );
}

function ChooserCard({
  icon,
  title,
  hint,
  example,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  example: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[88px] w-full items-start gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left hover:border-amber-300 hover:bg-amber-50/40"
    >
      <span className="mt-0.5 text-amber-800">{icon}</span>
      <span className="min-w-0">
        <span className="block text-base font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-700">{hint}</span>
        <span className="mt-1 block text-xs text-slate-500">{example}</span>
      </span>
    </button>
  );
}
