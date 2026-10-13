export function AccessDenied() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-slate-100">You don’t have access</h1>
      <p className="text-sm text-slate-400 mt-2">This page is outside your role. Use the menu to open a page you can work in.</p>
    </div>
  );
}
