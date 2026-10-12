document.getElementById('fill').addEventListener('click', async () => {
  const status = document.getElementById('status');
  let lines;
  try {
    lines = JSON.parse(document.getElementById('cart').value || '[]');
    if (!Array.isArray(lines)) throw new Error('Cart must be a list');
  } catch (error) {
    status.textContent = error.message || 'Cart is not valid';
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    status.textContent = 'No page open';
    return;
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fillCart,
    args: [lines],
  });
  status.textContent = 'Filled. Pay by hand. If the page looks wrong, use the checklist.';
});

function fillCart(lines) {
  const blocked = /pay|place order|checkout|card|cvv|cvc|expir/i;
  const inputs = [...document.querySelectorAll('input, textarea')].filter((el) => {
    const hint = `${el.name || ''} ${el.id || ''} ${el.getAttribute('autocomplete') || ''} ${el.placeholder || ''}`;
    return !blocked.test(hint);
  });
  lines.forEach((line, index) => {
    const field = inputs[index];
    if (!field) return;
    field.focus();
    field.value = `${line.quantity || 1} ${line.name || ''}`.trim();
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.querySelectorAll('button, [role="button"], input[type="submit"]').forEach((el) => {
    const label = (el.innerText || el.value || '').trim();
    if (blocked.test(label)) el.setAttribute('data-roam-do-not-press', 'pay');
  });
}
