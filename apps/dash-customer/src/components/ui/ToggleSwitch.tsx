type Props = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
};

export function ToggleSwitch({ checked, onChange, disabled, id }: Props) {
  return (
    <label
      className={`relative inline-block w-12 h-6 align-middle select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange?.(e.target.checked)}
        className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none z-10"
      />
      <span className={`toggle-label block overflow-hidden h-6 rounded-full ${checked ? 'bg-primary-container' : 'bg-surface-variant'}`} />
    </label>
  );
}
