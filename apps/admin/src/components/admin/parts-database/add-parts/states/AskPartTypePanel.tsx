import { useState } from "react";

export function AskPartTypePanel({ onSubmit }: { onSubmit: (p: { name: string; area?: string; exampleNumber?: string; reason: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button type="button" className="w-full p-4 rounded-xl border border-dashed border-outline-variant text-on-surface-variant font-body-sm" onClick={() => setOpen(true)}>
        Can&apos;t find it? Ask to add a part type
      </button>
    );
  }
  return (
    <div className="p-4 rounded-xl border border-outline-variant/50 flex flex-col gap-2">
      <input className="h-10 px-3 rounded-lg border" placeholder="Part type name" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea className="min-h-[80px] p-3 rounded-lg border" placeholder="Why do you need it?" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button
        type="button"
        className="h-10 rounded-xl bg-primary-container text-on-primary font-semibold"
        onClick={() => {
          if (!name.trim() || !reason.trim()) {
            return;
          }
          void onSubmit({ name: name.trim(), reason: reason.trim() }).then(() => { setOpen(false); setName(""); setReason(""); });
        }}
      >
        Submit request
      </button>
    </div>
  );
}
