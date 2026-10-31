export function normalizeFpButton(label: string) {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

export function fpButtonIs(label: string, ...needles: string[]) {
  const k = normalizeFpButton(label);
  return needles.some((n) => k === n || k.startsWith(`${n} `) || k.endsWith(` ${n}`));
}
