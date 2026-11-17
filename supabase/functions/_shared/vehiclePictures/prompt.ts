import { colorLabel } from "./color.ts";
import type { VehicleLook } from "./lookKey.ts";

export const PROMPT_VERSION = 1;

const SANITIZE_RE = /[^a-zA-Z0-9 \-/().]/g;

export function sanitizePromptPart(value: string): string {
  const cleaned = value.replace(SANITIZE_RE, "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 40);
}

/** " (2016–2020)", " (2016 on)" or "" when the catalogue has no years. */
function yearSpan(look: VehicleLook): string {
  const a = look.startYear;
  const b = look.endYear;
  if (a && b) return ` (${a}–${b})`;
  if (a) return ` (${a} on)`;
  return "";
}

function faceliftPhrase(stage: VehicleLook["faceliftStage"]): string {
  if (stage === "pre_facelift") return "pre-facelift styling";
  if (stage === "facelift") return "facelift styling";
  return "";
}

export function buildPicturePrompt(look: VehicleLook): string {
  const colour = sanitizePromptPart(colorLabel(look.color));
  const make = sanitizePromptPart(look.make);
  const model = sanitizePromptPart(look.model);
  const generation = sanitizePromptPart(look.generation);
  const body = sanitizePromptPart(look.bodyType);
  const years = yearSpan(look);
  const facelift = faceliftPhrase(look.faceliftStage);

  // The audit shows the variable parts in bold for reading only; the prompt sent to Imagen is plain text.
  const faceliftBit = facelift ? `, ${sanitizePromptPart(facelift)},` : ",";

  return (
    `Professional automotive studio photograph of a ${colour} ${make} ${model}, ${generation}${years}, ${body}${faceliftBit} Japanese-market right-hand-drive version. Front three-quarter view with the car facing right, the whole car in frame with a small even margin. Pure white seamless background, a soft natural shadow under the tyres, no floor reflection. Factory paint in true-to-life ${colour}, accurate body design, lights, grille and wheels for this exact generation. Photorealistic, sharp detail. No licence plate (blank plate area), no added text or watermarks, no people, no props.`
  );
}