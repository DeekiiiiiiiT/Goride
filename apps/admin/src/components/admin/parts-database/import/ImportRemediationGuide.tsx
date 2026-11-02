// Stitch: dominion-redesign/parts_import_template_upload
export function ImportRemediationGuide({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <div className="rounded-xl bg-surface-container-low p-4 space-y-2">
      <h4 className="text-sm font-semibold text-on-surface">Auto-remediation guide</h4>
      {messages.map((msg) => (
        <p key={msg} className="text-xs text-on-surface-variant">{msg}</p>
      ))}
    </div>
  );
}
