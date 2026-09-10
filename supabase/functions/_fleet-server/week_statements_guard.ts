/** Pure publish guards (no I/O) — unit-tested without Deno env. */

export function shouldBlockRestatementDraft(
  hasPriorClosed: boolean,
  status: "draft" | "closed",
  allowRestatementDraft?: boolean,
): boolean {
  return Boolean(hasPriorClosed && status === "draft" && !allowRestatementDraft);
}
