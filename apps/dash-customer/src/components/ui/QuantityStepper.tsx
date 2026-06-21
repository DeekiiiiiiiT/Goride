import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { hapticLight } from '@/lib/haptics';

type Props = {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  size?: 'sm' | 'md';
  className?: string;
};

export function QuantityStepper({
  value,
  min = 1,
  max = 99,
  onChange,
  size = 'md',
  className = '',
}: Props) {
  const btnSize = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const textSize = size === 'sm' ? 'text-body-md' : 'text-headline-md';

  const decrement = () => {
    if (value > min) {
      hapticLight();
      onChange(value - 1);
    }
  };

  const increment = () => {
    if (value < max) {
      hapticLight();
      onChange(value + 1);
    }
  };

  return (
    <div
      className={`flex items-center bg-surface-container-high rounded-full p-1 border border-surface-variant ${className}`}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={decrement}
        disabled={value <= min}
        className={`${btnSize} flex items-center justify-center rounded-full text-on-surface-variant disabled:opacity-40 active:scale-95 transition-transform`}
      >
        <MaterialIcon name="remove" size={size === 'sm' ? 18 : 20} />
      </button>
      <span className={`w-8 text-center font-semibold text-on-surface ${textSize}`}>{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={increment}
        disabled={value >= max}
        className={`${btnSize} flex items-center justify-center rounded-full text-on-surface-variant disabled:opacity-40 active:scale-95 transition-transform`}
      >
        <MaterialIcon name="add" size={size === 'sm' ? 18 : 20} />
      </button>
    </div>
  );
}
