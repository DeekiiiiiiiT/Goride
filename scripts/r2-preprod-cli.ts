/** R2 helpers for local preprod (C4b). Usage: deno run -A scripts/r2-preprod-cli.ts <cmd> ... */
import { writeFileSync } from "node:fs";
import { R2Client, r2ConfigFromEnv } from "../supabase/functions/_shared/objectStorage/r2Client.ts";

const r2 = new R2Client(r2ConfigFromEnv((n) => Deno.env.get(n) ?? undefined));
const [cmd, ...args] = Deno.args;

if (cmd === "head") {
  const h = await r2.head("public", args[0]!);
  console.log(JSON.stringify(h ?? { error: "not_found" }));
} else if (cmd === "download") {
  const bytes = await r2.read("public", args[0]!);
  writeFileSync(args[1]!, bytes);
  console.log(bytes.length);
} else if (cmd === "put-preprod-test") {
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
    (c) => c.charCodeAt(0),
  );
  const prev = Deno.env.get("R2_BUCKET_PUBLIC");
  Deno.env.set("R2_BUCKET_PUBLIC", "roam-public");
  const prodR2 = new R2Client(r2ConfigFromEnv((n) => Deno.env.get(n) ?? undefined));
  await prodR2.put("public", "_test/preprod.png", png, "image/png", "public, max-age=60");
  if (prev === undefined) Deno.env.delete("R2_BUCKET_PUBLIC");
  else Deno.env.set("R2_BUCKET_PUBLIC", prev);
  console.log("ok");
} else if (cmd === "remove-preprod-test") {
  const prev = Deno.env.get("R2_BUCKET_PUBLIC");
  Deno.env.set("R2_BUCKET_PUBLIC", "roam-public");
  const prodR2 = new R2Client(r2ConfigFromEnv((n) => Deno.env.get(n) ?? undefined));
  await prodR2.remove("public", ["_test/preprod.png"]);
  if (prev === undefined) Deno.env.delete("R2_BUCKET_PUBLIC");
  else Deno.env.set("R2_BUCKET_PUBLIC", prev);
  console.log("ok");
} else if (cmd === "remove") {
  await r2.remove("public", JSON.parse(args[0]!));
  console.log("ok");
} else {
  console.error("unknown cmd");
  Deno.exit(1);
}