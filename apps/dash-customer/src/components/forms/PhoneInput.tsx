type Props = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

export function PhoneInput({ value, onChange, required }: Props) {
  return (
    <div className="flex gap-2">
      <div
        className="flex items-center gap-2 bg-surface-container-high text-on-surface text-base rounded-lg px-4 py-4 border-2 border-transparent shrink-0"
        aria-label="Country code Jamaica +1"
      >
        <span aria-hidden>🇯🇲</span>
        <span className="font-semibold text-sm">+1</span>
      </div>
      <input
        type="tel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="876-555-1234"
        required={required}
        className="flex-1 bg-surface-container-high text-on-surface text-base rounded-lg px-4 py-4 border-2 border-transparent focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-all placeholder:text-on-surface-variant/60"
      />
    </div>
  );
}

export function formatJamaicaPhone(digits: string): string {
  const cleaned = digits.replace(/\D/g, '');
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
}

export function toE164JamaicaPhone(local: string): string {
  const digits = local.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return `+1${digits}`;
}
