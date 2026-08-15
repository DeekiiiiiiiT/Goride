/** Normalize a phone for tel:/sms: links; returns null if unusable. */
export function toDialablePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return cleaned.startsWith('+') ? cleaned : digits;
}

export function openPhoneCall(phone: string): void {
  const dial = toDialablePhone(phone);
  if (!dial) return;
  window.location.href = `tel:${dial}`;
}

export function openSmsMessage(phone: string, body?: string): void {
  const dial = toDialablePhone(phone);
  if (!dial) return;
  const qs = body ? `?body=${encodeURIComponent(body)}` : '';
  window.location.href = `sms:${dial}${qs}`;
}
