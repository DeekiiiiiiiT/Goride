/**
 * Maps Supabase Auth API errors to short, actionable copy for the driver app.
 */

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
      'In the Supabase Dashboard: Authentication → Providers → Phone → turn on Phone, then add an SMS provider (Twilio, Vonage, MessageBird, etc.) with valid API credentials.',
      '',
      'Guide: https://supabase.com/docs/guides/auth/phone-login',
    ].join('\n');
  }

  if (lower.includes('phone signups are disabled') || lower.includes('signup_disabled')) {
    return 'Phone sign-up is disabled for this Supabase project. Enable it under Authentication → Providers → Phone.';
  }

  if (lower.includes('sms_send_failed') || lower.includes('error sending sms')) {
    return `SMS could not be sent: ${t}\nCheck your SMS provider credentials and sender ID in the Supabase dashboard.`;
  }

  if (
    lower.includes('sms gateway not configured for digicel') ||
    lower.includes('sms gateway not configured for flow')
  ) {
    return [
      'The send-sms Edge Function is running, but Digicel/Flow API environment variables are not set yet.',
      '',
      'Add the carrier URLs and credentials on the function (see supabase/functions/send-sms/README.md), or enable SMS_HOOK_STUB_LOG_OK=1 only for internal hook testing.',
    ].join('\n');
  }

  if (lower.includes('invalid webhook signature')) {
    return 'SMS hook signing failed. Check that SEND_SMS_HOOK_SECRET on the send-sms function matches the Send SMS hook secret in the Supabase dashboard.';
  }

  if (lower.includes('token has expired') || lower.includes('otp_expired')) {
    return 'That code has expired. Request a new SMS code and try again.';
  }

  if (lower.includes('invalid otp') || lower.includes('invalid token')) {
    return 'That code is not valid. Check the SMS and try again, or request a new code.';
  }

  if (lower.includes('phone number already registered') || lower.includes('already been registered')) {
    return 'This phone number is already linked to another account. Use a different number or sign in with that account.';
  }

  return t;
}
