interface StickyBottomButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'emerald' | 'primary';
}

export default function StickyBottomButton({
  label,
  onClick,
  disabled = false,
  variant = 'emerald',
}: StickyBottomButtonProps) {
  const colorClass =
    variant === 'primary'
      ? 'bg-primary text-on-primary hover:bg-primary/90'
      : 'bg-primary-container text-on-primary-container hover:opacity-90';

  return (
    <>
      <div className="h-24" />
      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-surface-container-highest bg-surface/90 p-margin-mobile pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-md">
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`flex h-xl w-full items-center justify-center rounded-lg text-label-md font-semibold shadow-sm transition-all duration-150 active:scale-[0.98] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${colorClass}`}
        >
          {label}
        </button>
      </div>
    </>
  );
}
