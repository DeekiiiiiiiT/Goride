import { forwardRef, KeyboardEvent, Ref } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  name?: string;
  autoFocus?: boolean;
};

/** Gun-first barcode hero input. */
export const ScanBarcodeField = forwardRef(function ScanBarcodeField(
  {
    value,
    onChange,
    onSubmit,
    disabled,
    placeholder = 'Scan or type tracking #',
    label = 'Scan tracking barcode',
    name,
    autoFocus = true,
  }: Props,
  ref: Ref<HTMLInputElement>,
) {
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!disabled && value.trim()) onSubmit?.();
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <input
        ref={ref}
        name={name}
        autoFocus={autoFocus}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="mt-2 w-full rounded-xl border-2 border-amber-400 bg-slate-50 px-4 py-5 text-center font-mono text-2xl font-semibold tracking-wide text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100 disabled:opacity-60"
        placeholder={placeholder}
        autoComplete="off"
        inputMode="text"
      />
    </div>
  );
});
