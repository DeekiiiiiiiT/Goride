import { MaterialIcon } from '@/components/icons/MaterialIcon';

type Props = {
  value: number;
  onChange: (value: number) => void;
  size?: 'lg' | 'sm';
  className?: string;
};

export function StarRating({ value, onChange, size = 'lg', className = '' }: Props) {
  const iconSize = size === 'lg' ? 'text-[40px]' : 'text-[28px]';
  const gap = size === 'lg' ? 'gap-2' : 'gap-1';

  return (
    <div className={`flex ${gap} ${className}`}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
          onClick={() => onChange(star)}
          className={`transition-colors ${star <= value ? 'text-[#F59E0B]' : 'text-outline-variant hover:text-[#F59E0B]'}`}
        >
          <MaterialIcon name="star" className={iconSize} filled={star <= value} />
        </button>
      ))}
    </div>
  );
}
