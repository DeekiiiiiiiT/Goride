const TEAM_INVITE_TOKEN_KEY = 'roam_partner_team_invite_token';

export function persistTeamInviteToken(token: string) {
  sessionStorage.setItem(TEAM_INVITE_TOKEN_KEY, token);
}

export function readTeamInviteToken(): string | null {
  return sessionStorage.getItem(TEAM_INVITE_TOKEN_KEY);
}

export function clearTeamInviteToken() {
  sessionStorage.removeItem(TEAM_INVITE_TOKEN_KEY);
}

export function parseTeamInviteTokenFromPath(): string | null {
  const match = window.location.pathname.match(/^\/team-invite\/([^/]+)/);
  return match?.[1] ?? null;
}

export function clearTeamInvitePath() {
  if (window.location.pathname.startsWith('/team-invite/')) {
    window.history.replaceState({}, '', '/');
  }
}
