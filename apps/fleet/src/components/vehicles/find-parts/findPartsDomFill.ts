/** Replace Stitch sample strings in ported markup with live fleet values. */
export function applyFindPartsLiveText(root: ParentNode | null, replacements: Record<string, string>) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent;
    if (text) {
      let next = text;
      for (const [sample, live] of Object.entries(replacements)) {
        if (sample && live !== undefined && next.includes(sample)) {
          next = next.split(sample).join(live);
        }
      }
      if (next !== text) node.textContent = next;
    }
    node = walker.nextNode();
  }
}

export function bindMarkupInput(
  root: ParentNode | null,
  selector: string,
  value: string | number,
  onChange: (value: string) => void,
) {
  if (!root) return () => undefined;
  const el = root.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return () => undefined;
  el.value = String(value);
  const handler = () => onChange(el.value);
  el.addEventListener("input", handler);
  return () => el.removeEventListener("input", handler);
}

export function labelFromFpClick(detail: { label?: string; card?: boolean } | undefined) {
  return (detail?.label || "").replace(/\s+/g, " ").trim().toLowerCase();
}
