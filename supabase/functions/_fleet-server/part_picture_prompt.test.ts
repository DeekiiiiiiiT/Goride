/**
 * §3.4 prompt builder. The exact wording matters: the two closing-safety lines are what stopped the model drawing
 * the filter inside its housing (PP-30), and the no-label line is what a page without callouts gets (PP-16).
 * deno test --no-check supabase/functions/_fleet-server/part_picture_prompt.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPartPicturePrompt, PART_PROMPT_VERSION } from "./part_picture_prompt.ts";

const MATERIALS = "Molded black polypropylene housings, pleated white/off-white filter media with orange/amber rubber gasket trim, stamped steel clips.";

Deno.test("§3.4 the prompt is exactly the agreed text, line by line", () => {
  const prompt = buildPartPicturePrompt({
    label: "17801",
    partName: "ELEMENT SUB-ASSY, AIR CLEANER FILTER",
    materials: MATERIALS,
  });
  assertEquals(
    prompt.split("\n"),
    [
      "Look at the parts diagram in the attached image. Find the part labelled 17801 — ELEMENT SUB-ASSY, AIR CLEANER FILTER.",
      "Create one realistic, top-down photograph of only that part, on a plain light-grey studio surface, looking like a real part photographed with a real camera — not line art.",
      `Use these materials only where they belong to this part: ${MATERIALS}`,
      "Show the part on its own, exactly as it is sold: no housing, case, cover, clips, hoses or any other part that is not part of it.",
      "Soft, even overhead lighting with a natural contact shadow. The whole part in view, centred, sharp focus.",
      "No words, numbers, labels, logos or brand names anywhere in the picture. Do not include the diagram.",
    ],
  );
  assertEquals(PART_PROMPT_VERSION, 1);
});

Deno.test("§3.4 no callout on the page: the prompt names the part instead of a label", () => {
  const prompt = buildPartPicturePrompt({ label: null, partName: "SHOCK ABSORBER", materials: "" });
  const lines = prompt.split("\n");
  assertEquals(lines[0], "Look at the parts diagram in the attached image. Find the part named SHOCK ABSORBER.");
  assert(!lines.some((line) => line.includes("labelled")));
  assert(!lines.some((line) => line.includes("Use these materials")));
});

Deno.test("§3.4 a blank label counts as no label; a blank materials line is left out", () => {
  const blankLabel = buildPartPicturePrompt({ label: "  ", partName: "OIL FILTER", materials: "   " });
  assert(blankLabel.startsWith("Look at the parts diagram in the attached image. Find the part named OIL FILTER."));
  assert(!blankLabel.includes("Use these materials only"));
});

Deno.test("§3.4 the same part and template always gives the same prompt", () => {
  const input = { label: "17801", partName: "AIR FILTER", materials: MATERIALS };
  assertEquals(buildPartPicturePrompt(input), buildPartPicturePrompt({ ...input }));
});

Deno.test("§3.4 the no-brand and no-diagram rules are present in every prompt", () => {
  for (const label of ["17801", null]) {
    const prompt = buildPartPicturePrompt({ label, partName: "AIR FILTER", materials: "" });
    assert(prompt.includes("No words, numbers, labels, logos or brand names anywhere in the picture."));
    assert(prompt.includes("Do not include the diagram."));
  }
});
