/**
 * PIN verification utilities for rider identity verification.
 * Generates and validates 4-digit PINs for secure trip start.
 */

/**
 * Generate a cryptographically random 4-digit PIN.
 */
export function generatePin(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const pin = (array[0] % 10000).toString().padStart(4, '0');
  return pin;
}

/** Normalize DB/API PIN values (CHAR columns may include padding). */
export function normalizeVerificationPin(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return /^\d{4}$/.test(s) ? s : null;
}

/**
 * Validate that a PIN matches expected format (4 digits).
 */
export function isValidPinFormat(pin: unknown): pin is string {
  return normalizeVerificationPin(pin) != null;
}

/**
 * Verify that the provided PIN matches the expected PIN.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyPin(provided: string, expected: string): boolean {
  if (!isValidPinFormat(provided) || !isValidPinFormat(expected)) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < 4; i++) {
    result |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

export interface PinVerificationResult {
  verified: boolean;
  error?: 'invalid_format' | 'pin_mismatch' | 'pin_not_set' | 'already_verified';
}

/**
 * Verify a PIN for a ride, returning detailed result.
 */
export function verifyRidePin(
  providedPin: string,
  ride: { verification_pin: string | null; pin_verified_at: string | null },
): PinVerificationResult {
  if (ride.pin_verified_at) {
    return { verified: true, error: 'already_verified' };
  }
  
  const expectedPin = normalizeVerificationPin(ride.verification_pin);
  if (!expectedPin) {
    return { verified: false, error: 'pin_not_set' };
  }
  
  if (!isValidPinFormat(providedPin)) {
    return { verified: false, error: 'invalid_format' };
  }
  
  if (!verifyPin(providedPin, expectedPin)) {
    return { verified: false, error: 'pin_mismatch' };
  }
  
  return { verified: true };
}

/**
 * Mask PIN for secure logging (shows first digit only).
 */
export function maskPin(pin: string): string {
  if (!isValidPinFormat(pin)) return '****';
  return pin[0] + '***';
}
