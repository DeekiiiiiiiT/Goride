export function PausedScreen() {
  return (
    <div data-plug-screen="paused.html" className="flex min-h-screen flex-col bg-surface px-margin pb-28 pt-safe text-on-surface">
      <h1 className="mt-8 font-headline-sm text-headline-sm">Paused for now</h1>
      <p className="mt-2 text-sm text-on-surface-variant">This section is paused. It will be back.</p>
    </div>
  );
}
