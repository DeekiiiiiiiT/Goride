export function PersonaChip({ persona }: { persona: string }) {
  const labels: Record<string, string> = {
    customer: 'Customer',
    courier: 'Courier',
    merchant_owner: 'Merchant owner',
    merchant_staff: 'Staff',
  };
  return (
    <span className="inline-flex px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700">
      {labels[persona] ?? persona}
    </span>
  );
}
