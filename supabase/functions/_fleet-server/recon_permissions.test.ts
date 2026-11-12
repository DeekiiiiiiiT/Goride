/**
 * WRA-32: the §4.2 permission table, checked against the routes.
 * "prepare" = recon.prepare; "approve" = recon.approve (transactions.edit stays as the
 * existing admin alternative on the week-close routes).
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const here = dirname(fromFileUrl(import.meta.url));
const routes = await Deno.readTextFile(join(here, "recon_routes.ts"));
const controller = await Deno.readTextFile(join(here, "week_close_controller.tsx"));

function reconRoute(method: string, path: string): string {
  const marker = `app.${method}(\n    \`\${BASE}${path}\`,`;
  const i = routes.indexOf(marker);
  assert(i >= 0, `missing ${method} ${path}`);
  return routes.slice(i, routes.indexOf("async (c: Context)", i));
}
function closeRoute(path: string): string {
  const marker = path === "" ? "app.post(BASE," : `app.post(\`\${BASE}${path}\`,`;
  const i = controller.indexOf(marker);
  assert(i >= 0, `missing week-close ${path}`);
  return controller.slice(i, controller.indexOf("async (c)", i));
}

const TABLE: Array<[string, () => string, "prepare" | "approve" | "view"]> = [
  ["Mark no activity", () => reconRoute("post", "/runs/:line/:weekKey/sources/:sourceId/attest-none"), "prepare"],
  ["Remind Roam", () => reconRoute("post", "/runs/:line/:weekKey/sources/:sourceId/request"), "prepare"],
  ["Assign lines", () => reconRoute("post", "/runs/:line/:weekKey/attribution"), "prepare"],
  ["Complete a step", () => reconRoute("post", "/runs/:line/:weekKey/steps/:stepId/complete"), "prepare"],
  ["Waive", () => reconRoute("post", "/runs/:line/:weekKey/sources/:sourceId/waive"), "approve"],
  ["Send for approval", () => reconRoute("post", "/approvals"), "prepare"],
  ["Withdraw", () => reconRoute("post", "/approvals/:id/withdraw"), "prepare"],
  ["Approve", () => reconRoute("post", "/approvals/:id/approve"), "approve"],
  ["Reject", () => reconRoute("post", "/approvals/:id/reject"), "approve"],
  ["Acknowledge an alert", () => reconRoute("post", "/alerts/:id/acknowledge"), "approve"],
  ["See weeks", () => reconRoute("get", "/weeks"), "view"],
  ["See alerts", () => reconRoute("get", "/alerts"), "view"],
  ["See activity vs trips", () => reconRoute("get", "/runs/:line/:weekKey/activity"), "view"],
  ["Accept statement cash", () => closeRoute("/acknowledge-cash-source"), "approve"],
  ["Close week", () => closeRoute(""), "approve"],
  ["Reopen week", () => closeRoute("/reopen"), "approve"],
];

for (const [label, block, need] of TABLE) {
  Deno.test(`§4.2: ${label} needs ${need}`, () => {
    const text = block();
    const permission = `"recon.${need}"`;
    assert(text.includes(permission), `${label} must require recon.${need}`);
    if (need === "approve") assert(!text.includes('"recon.prepare"'), `${label} must not be open to prepare-only users`);
  });
}

Deno.test("WRA-32: a direct Close (self-approved) needs a reason of 8+ characters on the server", () => {
  const i = controller.indexOf("app.post(BASE,");
  assert(i >= 0, "missing week-close route");
  const body = controller.slice(i, controller.indexOf("app.post(", i + 10));
  assert(/String\(body\.reason \|\| ""\)\.trim\(\)\.length < 8/.test(body), "Close must refuse a missing reason");
  assert(body.includes("REASON_REQUIRED"), "Close must answer REASON_REQUIRED");
});
