// Stitch: dominion-redesign/s36g-imports-checks
export function ImportStepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: '1 Choose file' },
    { n: 2, label: 'Check' },
    { n: 3, label: 'Save as drafts' },
  ];
  return (
    <div className="flex items-center gap-2 text-xs">
      {items.map((item, index) => (
        <div key={item.n} className="flex items-center gap-2">
          <div className={step === item.n ? 'flex items-center gap-1.5 text-secondary font-semibold' : step > item.n ? 'flex items-center gap-1.5 text-tertiary font-medium' : 'flex items-center gap-1.5 text-outline'}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step > item.n ? 'bg-tertiary-container' : step === item.n ? 'bg-secondary-container' : 'bg-surface-container'}`}>{step > item.n ? '✓' : item.n}</span>
            <span>{item.label}</span>
          </div>
          {index < items.length - 1 ? <span className={`w-6 h-0.5 ${step > item.n ? 'bg-secondary' : 'bg-surface-container-highest'}`} /> : null}
        </div>
      ))}
    </div>
  );
}
