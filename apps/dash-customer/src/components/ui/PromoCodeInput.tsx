import { MaterialIcon } from '@/components/icons/MaterialIcon';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  placeholder?: string;
  appliedLabel?: string | null;
  className?: string;
};

export function PromoCodeInput({
  value,
  onChange,
  onApply,
  placeholder = 'Enter promo code',
  appliedLabel,
  className = '',
}: Props) {
  return (
    <div className={className}>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder={placeholder}
          className="flex-1 bg-[#F3F4F6] border-none rounded-lg px-4 py-3 text-body-md text-on-surface focus:bg-white focus:ring-2 focus:ring-primary focus:outline-none uppercase"
        />
        <button
          type="button"
          onClick={onApply}
          className="bg-primary text-on-primary text-label-md font-semibold tracking-wide px-5 py-3 rounded-lg active:scale-95 transition-transform shrink-0"
        >
          Apply
        </button>
      </div>
      {appliedLabel && (
        <div className="flex items-center gap-2 mt-2 text-primary text-body-sm">
          <MaterialIcon name="check_circle" size={16} filled />
          <span>{appliedLabel}</span>
        </div>
      )}
    </div>
  );
}
