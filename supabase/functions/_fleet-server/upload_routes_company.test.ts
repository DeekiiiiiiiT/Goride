import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Rev 25: the Uber upload saves driver metrics, vehicle metrics and payment lines. Since the
 * 21 Oct rule "every fleet row needs a company", unstamped rows fail, which left every Uber
 * upload stuck at "processing". These routes must sign the user in and stamp the company.
 */
const here = new URL("./", import.meta.url);
const read = (f: string) => Deno.readTextFile(new URL(f, here));

function routeBody(src: string, marker: string): string {
  const i = src.indexOf(marker);
  assert(i >= 0, `missing ${marker}`);
  return src.slice(i, src.indexOf("app.", i + marker.length));
}

Deno.test("driver-metrics and vehicle-metrics: signed in, every row stamped with the company", async () => {
  const src = await read("register_residual_monolith_routes.tsx");
  for (const path of ["/make-server-37f42386/driver-metrics\"", "/make-server-37f42386/vehicle-metrics\""]) {
    const i = src.search(new RegExp(`app\\.post\\(\\s*"${path.replace(/[/-]/g, (m) => `\\${m}`)}`));
    assert(i >= 0, `missing POST ${path}`);
    const body = src.slice(i, src.indexOf("return c.json({ success: true", i));
    assert(/requireAuth\(\{ requireOrg: true \}\)/.test(body), `${path} must require a signed-in company user`);
    assert(/stampOrg\(\{ \.\.\.m \}, c\)/.test(body), `${path} must stamp each row`);
  }
});

Deno.test("payment-ledger-lines import: every line stamped with the company", async () => {
  const src = await read("payment_ledger_line_controller.tsx");
  const body = routeBody(src, "app.post(`${BASE}/import`");
  assert(/const record = stampOrg\(\{/.test(body), "payment lines must be stamped");
});
