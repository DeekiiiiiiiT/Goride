import { productPortalAccess } from "./platformPermissions.ts";

Deno.test("productPortalAccess builds correct keys", () => {
  if (productPortalAccess("courier") !== "courier.portal.access") {
    throw new Error("courier portal key mismatch");
  }
  if (productPortalAccess("rides") !== "rides.portal.access") {
    throw new Error("rides portal key mismatch");
  }
});
