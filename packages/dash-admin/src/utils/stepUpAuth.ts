const STEP_UP_KEY = 'dash_admin_step_up_until';

export function markStepUpVerified(): void {
  sessionStorage.setItem(STEP_UP_KEY, String(Date.now() + 15 * 60 * 1000));
}

export function hasValidStepUp(): boolean {
  const raw = sessionStorage.getItem(STEP_UP_KEY);
  if (!raw) return false;
  return Date.now() < Number(raw);
}

export async function requireStepUp(
  promptPassword: () => Promise<boolean>,
): Promise<boolean> {
  if (hasValidStepUp()) return true;
  const ok = await promptPassword();
  if (ok) markStepUpVerified();
  return ok;
}
