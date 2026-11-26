/**
 * The part-picture prompt (docs/part-pictures-audit.md §3.4). One picture per part, no words drawn in it.
 *
 * The two closing-safety lines come from the real probe: with the Filters materials line alone the model drew the
 * filter inside its housing, with clips (PP-30). They are part of the prompt, not an option.
 */

/** Bump when the wording changes; every picture stores the version that made it (PP-14). */
export const PART_PROMPT_VERSION = 1;

export type PartPromptInput = {
  /** The diagram callout, e.g. "17801". Null when the page prints none (PP-16). */
  label: string | null;
  /** The part's name as the catalogue page writes it. */
  partName: string;
  /** The group template's materials line. Empty drops that line. */
  materials: string;
};

/** The exact prompt for one part. Deterministic: the same input always gives the same text. */
export function buildPartPicturePrompt(input: PartPromptInput): string {
  const label = String(input.label ?? "").trim();
  const partName = String(input.partName ?? "").trim();
  const materials = String(input.materials ?? "").trim();

  const first = label
    ? `Look at the parts diagram in the attached image. Find the part labelled ${label} — ${partName}.`
    : `Look at the parts diagram in the attached image. Find the part named ${partName}.`;

  const lines = [
    first,
    "Create one realistic, top-down photograph of only that part, on a plain light-grey studio surface, looking like a real part photographed with a real camera — not line art.",
  ];
  if (materials) lines.push(`Use these materials only where they belong to this part: ${materials}`);
  lines.push(
    "Show the part on its own, exactly as it is sold: no housing, case, cover, clips, hoses or any other part that is not part of it.",
    "Soft, even overhead lighting with a natural contact shadow. The whole part in view, centred, sharp focus.",
    "No words, numbers, labels, logos or brand names anywhere in the picture. Do not include the diagram.",
  );
  return lines.join("\n");
}
