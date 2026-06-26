export const PARTNER_PRODUCTION_ORIGIN = 'https://partner.roamdash.co';

export const PARTNER_OAUTH_INTENT_KEY = 'roam_partner_oauth_intent';
export const PARTNER_OAUTH_INTENT_SIGNUP = 'signup';
export const PARTNER_OAUTH_INTENT_LOGIN = 'login';

export function getPartnerAuthRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const { origin, pathname } = window.location;
    if (pathname.startsWith('/team-invite/')) {
      return `${origin}${pathname}`;
    }
    if (pathname === '/tablet' || pathname.startsWith('/tablet/')) {
      return `${origin}${pathname}${window.location.search}`;
    }
    return `${origin}/`;
  }
  return `${PARTNER_PRODUCTION_ORIGIN}/`;
}

export function clearPartnerOAuthIntent(): void {
  sessionStorage.removeItem(PARTNER_OAUTH_INTENT_KEY);
}

export function consumePartnerOAuthIntent(): string | null {
  const intent = sessionStorage.getItem(PARTNER_OAUTH_INTENT_KEY);
  if (intent) {
    sessionStorage.removeItem(PARTNER_OAUTH_INTENT_KEY);
  }
  return intent;
}

export function clearPartnerOAuthUrl(): void {
  const { hash, search, pathname } = window.location;
  if (hash.includes('access_token') || search.includes('code=')) {
    window.history.replaceState({}, '', pathname);
  }
}

export const PARTNER_WIZARD_DRAFT_KEY = 'roam_partner_wizard_draft';

/** Bump when wizard step fields or draft shape changes (invalidates stale sessionStorage drafts). */
export const PARTNER_WIZARD_DRAFT_VERSION = 5;

export function clearPartnerWizardDraft(): void {
  sessionStorage.removeItem(PARTNER_WIZARD_DRAFT_KEY);
}
