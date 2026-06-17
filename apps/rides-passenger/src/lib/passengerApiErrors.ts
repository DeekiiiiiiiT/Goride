/** Map rides edge error codes to rider-friendly copy. */
export function passengerApiErrorMessage(code: string, fallback?: string): string {
  switch (code) {
    case 'forbidden_role':
      return 'This account cannot use Roam Contacts from here. Sign out, then sign back in through Roam Rides.';
    default:
      return fallback ?? code;
  }
}
