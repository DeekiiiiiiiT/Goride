/**
 * Credentials for the seeded smoke accounts.
 *
 * These are REAL production users. Their shared passwords were revoked on 24 Nov 2026 after the
 * values leaked into this repo, so nothing here may contain a password: each script reads it from
 * the environment and fails loudly when it is missing.
 *
 * `scripts/check-before-push.mjs` refuses a hard-coded password next to a production supabase.co
 * URL, so a literal cannot come back by accident.
 */

export const TEST_ACCOUNT_ENV = {
  courier: "RUSH_TEST_COURIER_PASSWORD",
  customer: "RUSH_TEST_CUSTOMER_PASSWORD",
  partner: "RUSH_TEST_PARTNER_PASSWORD",
  admin: "RUSH_TEST_ADMIN_PASSWORD",
};

/**
 * Read a test account's password from the environment.
 * @param {string} envName  variable name, e.g. RUSH_TEST_COURIER_PASSWORD
 * @param {string} label    human description used in the error, e.g. "the seed courier account"
 */
export function testPassword(envName, label) {
  const value = (process.env[envName] || "").trim();
  if (!value) {
    throw new Error(
      `Missing ${envName}: ${label} is a real account whose password is not stored in the repo. ` +
        `Export ${envName} in your shell (or a gitignored .env) and run again.`,
    );
  }
  return value;
}

/** Convenience wrappers so callers do not repeat the label. */
export const courierPassword = () =>
  testPassword(TEST_ACCOUNT_ENV.courier, "the seed courier account (seed-courier@)");
export const customerPassword = () =>
  testPassword(TEST_ACCOUNT_ENV.customer, "the seed customer account (seed-customer@)");
export const partnerPassword = () =>
  testPassword(TEST_ACCOUNT_ENV.partner, "the seed partner account (seed-island-grill@)");
export const adminPassword = () =>
  testPassword(TEST_ACCOUNT_ENV.admin, "the dash_admin smoke account (user-mgmt-smoke@)");
