export function AllDoneStep({ driverName }: { driverName: string }) {
  const name = driverName.trim() || 'Driver';
  return (
    <div className="space-y-2">
      <p className="text-base font-semibold text-slate-900">All done</p>
      <p className="text-sm text-slate-700">
        Past-week clean-up for {name} is finished. Balances now include the older weeks you kept and the fuel corrections. The missing payments are in the payment history.
      </p>
    </div>
  );
}
