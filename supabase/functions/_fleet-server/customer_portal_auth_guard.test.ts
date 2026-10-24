/**
 * Fails if a customer team or workforce route deletes an account or sets a password.
 * Run: deno test --no-check customer_portal_auth_guard.test.ts
 */
const FILES = [
  "team_staff_routes.ts",
  "team_staff_service.ts",
  "workforce_lifecycle_routes.ts",
  "workforce_membership.ts",
  "workforce_link.ts",
];

Deno.test("customer portal team routes do not delete users or set passwords", async () => {
  for (const name of FILES) {
    const text = await Deno.readTextFile(new URL(`./${name}`, import.meta.url));
    if (text.includes("deleteUser")) {
      throw new Error(`${name} calls deleteUser`);
    }
    if (/password\s*:/.test(text)) {
      throw new Error(`${name} writes a password field`);
    }
  }
  const monolith = await Deno.readTextFile(
    new URL("./register_residual_monolith_routes.tsx", import.meta.url),
  );
  if (monolith.includes("/delete-user")) {
    throw new Error("fleet delete-user route is still registered");
  }
  const updateAt = monolith.indexOf('"/make-server-37f42386/update-user"');
  const updateSlice = updateAt >= 0 ? monolith.slice(updateAt, updateAt + 1800) : "";
  if (!updateSlice.includes("hasPlatformOwnerAccess")) {
    throw new Error("update-user does not require platform owner for role writes");
  }
});
