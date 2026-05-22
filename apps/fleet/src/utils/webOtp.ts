/**
 * Chrome / Chromium (especially Android): suggests SMS OTP via Web OTP API.
 * Requires HTTPS and an SMS body that matches origin-bound OTP rules for best results.
 * WhatsApp-delivered codes will not surface here.
 */
export function listenForSmsOtp(
  onCode: (code: string) => void,
  opts?: { signal?: AbortSignal }
): void {
  if (typeof window === 'undefined' || !('OTPCredential' in window)) return;

  const ac = new AbortController();
  const outer = opts?.signal;
  if (outer) {
    if (outer.aborted) return;
    outer.addEventListener('abort', () => ac.abort(), { once: true });
  }

  const req: CredentialRequestOptions = {
    otp: { transport: ['sms'] as const },
    signal: ac.signal,
  };

  void navigator.credentials.get(req).then(cred => {
    if (cred && 'code' in cred && typeof (cred as { code?: string }).code === 'string') {
      onCode((cred as { code: string }).code);
    }
  });
}
