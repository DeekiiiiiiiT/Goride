import { useState } from "react";
import { MaterialIcon } from "../../import/MaterialIcon";

export function AskPartTypePanel({ onSubmit }: { onSubmit: (p: { name: string; area?: string; exampleNumber?: string; reason: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        className="w-full p-4 rounded-xl border border-dashed border-outline-variant/80 hover:border-primary-container bg-surface-container-low/40 hover:bg-surface-container-low flex items-center justify-between gap-space-md transition-all text-left"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center gap-space-md min-w-0">
          <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
            <MaterialIcon name="add" className="text-[20px]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label-md text-label-md font-semibold text-on-surface">Can&apos;t find it? Ask to add a part type</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">Submit schema addition request to master taxonomy database</span>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded bg-surface-container-highest text-on-surface-variant font-mono-sm text-mono-sm font-medium shrink-0 hidden sm:inline">
          REQUEST
        </span>
      </button>
    );
  }
  return (
    <div className="p-4 rounded-xl border border-outline-variant/50 bg-surface-container-lowest flex flex-col gap-space-md shadow-sm">
      <div className="flex items-center gap-2">
        <MaterialIcon name="add" className="text-primary-container text-[20px]" />
        <span className="font-headline-md text-headline-md text-on-surface">Ask to add a part type</span>
      </div>
      <input className="h-10 px-3 rounded-lg border border-outline-variant/50 bg-surface-container-lowest font-body-md" placeholder="Part type name" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea className="min-h-[80px] p-3 rounded-lg border border-outline-variant/50 bg-surface-container-lowest font-body-sm" placeholder="Why do you need it?" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="h-10 px-4 rounded-lg border border-outline-variant/50 font-label-md" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="h-10 px-6 rounded-lg bg-primary-container text-on-primary font-label-md font-semibold"
          onClick={() => {
            if (!name.trim() || !reason.trim()) return;
            void onSubmit({ name: name.trim(), reason: reason.trim() }).then(() => {
              setOpen(false);
              setName("");
              setReason("");
            });
          }}
        >
          Submit request
        </button>
      </div>
    </div>
  );
}
