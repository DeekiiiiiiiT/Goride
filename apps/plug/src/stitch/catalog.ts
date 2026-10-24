const files = import.meta.glob('../../../../docs/stitch/roam-plug/html/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function stitchHtml(name: string): string {
  const match = Object.entries(files).find(([key]) => key.endsWith(`/${name}`));
  return match?.[1] || '';
}

const BRIDGE = `<script>
document.addEventListener('click', function (event) {
  var el = event.target && event.target.closest ? event.target.closest('a, button') : null;
  if (!el) return;
  var path = el.getAttribute('data-path') || '';
  var fields = {};
  document.querySelectorAll('input, textarea, select').forEach(function (node) {
    if (!node.id) return;
    fields[node.id] = node.type === 'checkbox' ? !!node.checked : node.value;
  });
  if (path) event.preventDefault();
  parent.postMessage({
    source: 'roam-plug-stitch',
    id: el.id || '',
    path: path,
    label: (el.innerText || '').replace(/\\s+/g, ' ').trim(),
    fields: fields
  }, '*');
});
</script>`;

export function presentStitch(name: string, html: string): string {
  let next = html;
  if (name === '05-otp.html') {
    const phone = sessionStorage.getItem('plug-phone');
    if (phone) next = next.replace('+1 (876) 842-9104', phone);
    let box = 0;
    next = next.replace(/<div class="flex-1 max-w-\[52px\][\s\S]*?<\/div>/g, (block) => {
      if (box >= 6) return block;
      const index = box;
      box += 1;
      return `<input id="otp-${index}" inputmode="numeric" maxlength="1" class="flex-1 max-w-[52px] h-14 rounded-xl bg-surface-container-lowest shadow-sm text-center text-on-surface font-price-display text-price-display font-extrabold" />`;
    });
  }
  return next.replace('</body>', `${BRIDGE}</body>`);
}
