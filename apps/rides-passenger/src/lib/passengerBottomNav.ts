/** Service booking flows where tab navigation would distract or risk losing progress. */
const FOCUSED_FLOW_PREFIXES = [
  '/services/haulage',
  '/services/schedule',
  '/services/courier',
  '/services/event',
  '/services/book-for-someone',
  '/services/book-for-me',
  '/account/contacts/places',
] as const;

/** Hide the main tab bar on multi-step booking and checkout screens. */
export function shouldHidePassengerBottomNav(pathname: string): boolean {
  return FOCUSED_FLOW_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
