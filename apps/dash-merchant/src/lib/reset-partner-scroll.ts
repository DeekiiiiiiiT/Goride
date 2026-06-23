/** Reset document and in-app scroll positions when switching partner tabs. */
export function resetPartnerScroll(root?: HTMLElement | null) {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  if (!root) return;

  root.scrollTop = 0;
  root.querySelectorAll('[data-partner-scroll]').forEach((node) => {
    if (node instanceof HTMLElement) {
      node.scrollTop = 0;
    }
  });
}
