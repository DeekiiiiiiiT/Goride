import { readFileSync } from 'node:fs';

const OPACITY_SUFFIXES = [20, 30, 40, 50, 60, 80];

const DEFAULT_DARK = {
  surface: '#2e2e2e',
  'surface-container-lowest': '#2e2e2e',
  'surface-container-low': '#333333',
  'surface-container': '#383838',
  'surface-container-high': '#3d3d3d',
  'surface-container-highest': '#444444',
  background: '#252525',
  'on-surface': '#fafafa',
  'on-surface-variant': '#b4b4b4',
  'on-background': '#fafafa',
  outline: '#444444',
  'outline-variant': '#444444',
  primary: '#fafafa',
  'on-primary': '#252525',
  secondary: '#34d399',
  error: '#f87171',
  'surface-bright': '#2e2e2e',
  'surface-dim': '#b4b4b4',
};

export function parseTailwindConfigFromHtml(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const m = html.match(/tailwind\.config\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i);
  if (!m) throw new Error(`No tailwind.config in ${htmlPath}`);
  return Function(`"use strict"; return (${m[1]});`)();
}

export function mergeThemeExtend(configs) {
  const merged = { colors: {}, spacing: {}, fontSize: {}, fontFamily: {}, borderRadius: {} };
  for (const cfg of configs) {
    const ext = cfg?.theme?.extend ?? {};
    Object.assign(merged.colors, ext.colors ?? {});
    Object.assign(merged.spacing, ext.spacing ?? {});
    Object.assign(merged.fontSize, ext.fontSize ?? {});
    Object.assign(merged.fontFamily, ext.fontFamily ?? {});
    Object.assign(merged.borderRadius, ext.borderRadius ?? {});
  }
  return merged;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function withAlpha(hex, alpha) {
  if (!hex.startsWith('#')) return hex;
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escClass(name) {
  return name.replace(/\//g, '\\/').replace(/:/g, '\\:');
}

function fontRule(scope, token, size, line, track, weight) {
  const base = `.${scope} .text-${token}, .${scope} .font-${token}`;
  return `${base} { font-size: ${size}; line-height: ${line}; letter-spacing: ${track}; font-weight: ${weight}; }`;
}

function parseFontSizeEntry(entry) {
  if (Array.isArray(entry)) {
    const size = entry[0];
    const meta = entry[1] ?? {};
    return {
      size,
      line: meta.lineHeight ?? 'normal',
      track: meta.letterSpacing ?? '0em',
      weight: meta.fontWeight ?? '400',
    };
  }
  return { size: String(entry), line: 'normal', track: '0em', weight: '400' };
}

export function generateScopedStitchCss(scope, theme, options = {}) {
  const { dark = DEFAULT_DARK, monoFontTokens = ['label-plate', 'label-code', 'label-price'] } = options;
  const lines = [];

  lines.push(`/* Generated from Stitch tailwind.config — do not hand-edit token rules. Run build:*-parts-css. */`);
  lines.push(`.${scope} { font-family: Inter, sans-serif; color: ${theme.colors['on-surface'] ?? '#191c1e'}; background: ${theme.colors.surface ?? theme.colors.background ?? '#f7f9fb'}; }`);
  lines.push(`.${scope} .material-symbols-outlined { font-family: "Material Symbols Outlined"; font-weight: normal; font-style: normal; line-height: 1; display: inline-block; white-space: nowrap; font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24; }`);

  if (monoFontTokens.length) {
    lines.push(`${monoFontTokens.map((t) => `.${scope} .font-${t}`).join(',\n')} { font-family: "JetBrains Mono", ui-monospace, monospace; }`);
  }

  for (const [token, entry] of Object.entries(theme.fontSize)) {
    const { size, line, track, weight } = parseFontSizeEntry(entry);
    lines.push(fontRule(scope, token, size, line, track, weight));
  }

  for (const [name, value] of Object.entries(theme.colors)) {
    const esc = escClass(name);
    lines.push(`.${scope} .bg-${esc} { background-color: ${value}; }`);
    lines.push(`.${scope} .text-${esc} { color: ${value}; }`);
    lines.push(`.${scope} .border-${esc} { border-color: ${value}; }`);
    lines.push(`.${scope} .hover\\:bg-${esc}:hover { background-color: ${value}; }`);
    lines.push(`.${scope} .hover\\:text-${esc}:hover { color: ${value}; }`);
    lines.push(`.${scope} .hover\\:border-${esc}:hover { border-color: ${value}; }`);
    lines.push(`.${scope} .group:hover .group-hover\\:bg-${esc} { background-color: ${value}; }`);
    lines.push(`.${scope} .group:hover .group-hover\\:text-${esc} { color: ${value}; }`);
    lines.push(`.${scope} .group:hover .group-hover\\:border-${esc} { border-color: ${value}; }`);
    for (const pct of OPACITY_SUFFIXES) {
      const a = pct / 100;
      const rgba = withAlpha(value, a);
      lines.push(`.${scope} .bg-${esc}\\/${pct} { background-color: ${rgba}; }`);
      lines.push(`.${scope} .text-${esc}\\/${pct} { color: ${rgba}; }`);
      lines.push(`.${scope} .border-${esc}\\/${pct} { border-color: ${rgba}; }`);
    }
  }

  for (const [name, value] of Object.entries(theme.spacing)) {
    const esc = escClass(name);
    const neg = name.startsWith('-') ? name.slice(1) : name;
    const negEsc = escClass(neg);
    lines.push(`.${scope} .p-${esc} { padding: ${value}; }`);
    lines.push(`.${scope} .px-${esc} { padding-left: ${value}; padding-right: ${value}; }`);
    lines.push(`.${scope} .py-${esc} { padding-top: ${value}; padding-bottom: ${value}; }`);
    lines.push(`.${scope} .pt-${esc} { padding-top: ${value}; }`);
    lines.push(`.${scope} .pb-${esc} { padding-bottom: ${value}; }`);
    lines.push(`.${scope} .pl-${esc} { padding-left: ${value}; }`);
    lines.push(`.${scope} .pr-${esc} { padding-right: ${value}; }`);
    lines.push(`.${scope} .m-${esc} { margin: ${value}; }`);
    lines.push(`.${scope} .mt-${esc} { margin-top: ${value}; }`);
    lines.push(`.${scope} .mb-${esc} { margin-bottom: ${value}; }`);
    lines.push(`.${scope} .my-${esc} { margin-top: ${value}; margin-bottom: ${value}; }`);
    lines.push(`.${scope} .ml-${esc} { margin-left: ${value}; }`);
    lines.push(`.${scope} .mr-${esc} { margin-right: ${value}; }`);
    lines.push(`.${scope} .-mx-${negEsc} { margin-left: -${value}; margin-right: -${value}; }`);
    lines.push(`.${scope} .-mt-${negEsc} { margin-top: -${value}; }`);
    lines.push(`.${scope} .-mb-${negEsc} { margin-bottom: -${value}; }`);
    lines.push(`.${scope} .gap-${esc} { gap: ${value}; }`);
    lines.push(`.${scope} .gap-x-${esc} { column-gap: ${value}; }`);
    lines.push(`.${scope} .gap-y-${esc} { row-gap: ${value}; }`);
    lines.push(`.${scope} .space-y-${esc} > :not([hidden]) ~ :not([hidden]) { margin-top: ${value}; }`);
    lines.push(`.${scope} .space-x-${esc} > :not([hidden]) ~ :not([hidden]) { margin-left: ${value}; }`);
  }

  lines.push(`.dark .${scope} { background: ${dark.background}; color: ${dark['on-surface']}; }`);
  for (const [name, value] of Object.entries(dark)) {
    const esc = escClass(name);
    lines.push(`.dark .${scope} .bg-${esc} { background-color: ${value}; }`);
    lines.push(`.dark .${scope} .text-${esc} { color: ${value}; }`);
    lines.push(`.dark .${scope} .border-${esc} { border-color: ${value}; }`);
  }

  return lines;
}
