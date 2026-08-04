/** Generic message for wrong password or non-admin role — never disclose which. */
export const ADMIN_INCORRECT_CREDENTIALS = 'Incorrect credentials';

const FLASH_KEY = 'roam_admin_login_error';

export function flashAdminLoginError(message = ADMIN_INCORRECT_CREDENTIALS): void {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    /* private mode / blocked storage */
  }
}

export function consumeAdminLoginErrorFlash(): string | null {
  try {
    const value = sessionStorage.getItem(FLASH_KEY);
    if (value) sessionStorage.removeItem(FLASH_KEY);
    return value;
  } catch {
    return null;
  }
}
