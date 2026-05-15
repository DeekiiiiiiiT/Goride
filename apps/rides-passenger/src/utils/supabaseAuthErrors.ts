export function getAuthErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  return fallback;
}

export function formatPhoneAuthError(message: string): string {
  const t = message.trim();
  const lower = t.toLowerCase();

  if (lower.includes('unsupported phone provider')) {
    return [
      'Supabase is not set up to send phone codes yet (no SMS/WhatsApp provider on this project).',
      '',
      'In the Supabase Dashboard: Authentication → Providers → Phone → turn on Phone, then add an SMS provider.',
      '',
      'Guide: https://supabase.com/docs/guides/auth/phone-login',
    ].join('\n');
  }

  if (lower.includes('phone signups are disabled') || lower.includes('signup_disabled')) {
    return 'Phone sign-up is disabled for this Supabase project.';
  }

  if (lower.includes('sms_send_failed') || lower.includes('error sending sms')) {
    return `SMS could not be sent: ${t}`;
  }

  if (
    lower.includes('sms gateway not configured for digicel') ||
    lower.includes('sms gateway not configured for flow')
  ) {
    return [
      'The send-sms Edge Function is running, but carrier API environment variables are not set yet.',
      '',
      'See supabase/functions/send-sms/README.md.',
    ].join('\n');
  }

  if (lower.includes('invalid webhook signature')) {
    return 'SMS hook signing failed. Check SEND_SMS_HOOK_SECRET matches the dashboard.';
  }

  if (lower.includes('token has expired') || lower.includes('otp_expired')) {
    return 'That code has expired. Request a new code and try again.';
  }

  if (lower.includes('invalid otp') || lower.includes('invalid token')) {
    return 'That code is not valid. Check the message and try again, or request a new code.';
  }

  if (lower.includes('phone number already registered') || lower.includes('already been registered')) {
    return 'This phone number is already linked to another account.';
  }

  return t;
}
