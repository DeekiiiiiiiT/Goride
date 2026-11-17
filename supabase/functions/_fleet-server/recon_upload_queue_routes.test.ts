/**
 * WRA-70: upload save paths are declared on manifest upload sources and must queue
 * a desk refresh via afterReconSourceUpload (or the documented client-register exception).
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { RECON_SOURCES } from "./recon_sources_mirror.ts";

const here = dirname(fromFileUrl(import.meta.url));
const repoRoot = join(here, "../../..");

function handlerBlock(src: string, routeNeedle: string): string {
  const start = src.indexOf(routeNeedle);
  assert(start >= 0, `route needle not found: ${routeNeedle}`);
  const nextApp = src.indexOf("\n  app.", start + routeNeedle.length);
  return nextApp < 0 ? src.slice(start) : src.slice(start, nextApp);
}

function assertSuccessAfterHelper(block: string, sourceId: string, route: string): void {
  const helperAt = block.indexOf("afterReconSourceUpload(");
  assert(helperAt >= 0, `${sourceId} ${route}: must call afterReconSourceUpload`);
  const successAt = block.indexOf("success: true", helperAt);
  assert(successAt >= 0, `${sourceId} ${route}: expected a success response in handler`);
  assert(helperAt < successAt, `${sourceId} ${route}: afterReconSourceUpload must run before success answer`);
}

const uploadSources = RECON_SOURCES.filter((s) => s.kind === "upload");

Deno.test("every upload source lists at least one uploadRoutes entry", () => {
  for (const def of uploadSources) {
    const routes = def.uploadRoutes ?? [];
    assert(routes.length >= 1, `${def.id}: add uploadRoutes on the manifest`);
  }
  assert(uploadSources.length >= 1, "manifest should include upload sources");
});

Deno.test("listed routes call afterReconSourceUpload or documented client-register exception", async () => {
  const seen = new Map<string, "client_register" | "server">();

  for (const def of uploadSources) {
    for (const ref of def.uploadRoutes ?? []) {
      const key = `${ref.file}::${ref.route}`;
      const kind: "client_register" | "server" = ref.exception === "client_register"
        ? "client_register"
        : "server";
      const prior = seen.get(key);
      if (prior && prior !== kind) {
        throw new Error(`${key}: conflicting exception flags across sources`);
      }
      seen.set(key, kind);

      const serverPath = join(here, ref.file);
      const src = await Deno.readTextFile(serverPath);
      assert(src.includes(ref.route), `${def.id}: missing route ${ref.route} in ${ref.file}`);
      const block = handlerBlock(src, ref.route);

      if (ref.exception === "client_register") {
        assert(
          !block.includes("afterReconSourceUpload"),
          `${def.id} ${ref.route}: client_register routes must not call afterReconSourceUpload`,
        );
        assert(ref.clientRegister, `${def.id} ${ref.route}: clientRegister path required`);
        const clientSrc = await Deno.readTextFile(join(repoRoot, ref.clientRegister));
        assert(
          clientSrc.includes("registerReconImport"),
          `${ref.clientRegister} must register via recon /register (queues refresh)`,
        );
      } else {
        assertSuccessAfterHelper(block, def.id, ref.route);
      }
    }
  }
});