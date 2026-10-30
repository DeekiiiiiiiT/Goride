import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const colors = {
  'surface-bright': '#f7f9fb',
  tertiary: '#000000',
  'on-secondary': '#ffffff',
  'secondary-fixed': '#e2e1f4',
  'error-container': '#ffdad6',
  background: '#f7f9fb',
  'tertiary-fixed-dim': '#ffb690',
  'on-primary-fixed-variant': '#46445b',
  'surface-tint': '#5e5c74',
  'on-secondary-fixed-variant': '#454555',
  'secondary-container': '#dfdef1',
  'on-secondary-container': '#616172',
  'on-surface-variant': '#47464c',
  'primary-fixed-dim': '#c8c3df',
  'on-surface': '#191c1e',
  'on-primary': '#ffffff',
  'surface-dim': '#d8dadc',
  'on-tertiary-container': '#d95f00',
  'surface-container-high': '#e6e8ea',
  outline: '#78767d',
  'on-tertiary-fixed-variant': '#783200',
  'surface-container': '#eceef0',
  primary: '#000000',
  'on-background': '#191c1e',
  error: '#ba1a1a',
  'primary-fixed': '#e4dffc',
  'on-tertiary-fixed': '#341100',
  'inverse-surface': '#2d3133',
  'on-error-container': '#93000a',
  'on-error': '#ffffff',
  'on-secondary-fixed': '#1a1a28',
  'on-primary-fixed': '#1b192e',
  'on-primary-container': '#84819a',
  'primary-container': '#1b192e',
  'inverse-on-surface': '#eff1f3',
  'tertiary-fixed': '#ffdbca',
  'inverse-primary': '#c8c3df',
  'tertiary-container': '#341100',
  'surface-container-low': '#f2f4f6',
  'on-tertiary': '#ffffff',
  'secondary-fixed-dim': '#c6c5d8',
  surface: '#f7f9fb',
  'surface-container-lowest': '#ffffff',
  'outline-variant': '#c9c5cd',
  'surface-container-highest': '#e0e3e5',
  secondary: '#5d5d6d',
  'surface-variant': '#e0e3e5',
};

const space = {
  gutter: '1rem',
  'gutter-desktop': '1.5rem',
  margin: '1rem',
  'space-xl': '1.5rem',
  'space-xs': '0.25rem',
  'space-md': '0.75rem',
  'space-lg': '1rem',
  'margin-desktop': '2rem',
  'space-sm': '0.5rem',
};

const fonts = {
  'headline-sm': ['18px', '26px', '-0.01em', '600'],
  'body-md': ['14px', '20px', '0em', '400'],
  'headline-xl': ['30px', '38px', '-0.02em', '600'],
  'label-plate': ['14px', '18px', '0.08em', '700'],
  'body-lg': ['16px', '24px', '-0.005em', '400'],
  'label-price': ['14px', '20px', '-0.02em', '600'],
  'headline-lg': ['24px', '32px', '-0.015em', '600'],
  caption: ['11px', '14px', '0.02em', '500'],
  'label-code': ['13px', '18px', '-0.01em', '500'],
  'body-sm': ['13px', '18px', '0em', '400'],
};

const dark = {
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

const lines = [
  '/* Scoped to Find parts. Other Fleet tabs do not use these names. */',
  '.fleet-find-parts-stitch { font-family: Inter, sans-serif; color: #191c1e; background: #f7f9fb; }',
  '.fleet-find-parts-stitch .material-symbols-outlined { font-family: "Material Symbols Outlined"; font-weight: normal; font-style: normal; line-height: 1; display: inline-block; white-space: nowrap; font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24; }',
  '.fleet-find-parts-stitch .font-label-plate,',
  '.fleet-find-parts-stitch .font-label-code,',
  '.fleet-find-parts-stitch .font-label-price { font-family: "JetBrains Mono", ui-monospace, monospace; }',
];

for (const [name, [size, line, track, weight]] of Object.entries(fonts)) {
  lines.push(`.fleet-find-parts-stitch .text-${name} { font-size: ${size}; line-height: ${line}; letter-spacing: ${track}; font-weight: ${weight}; }`);
}

for (const [name, value] of Object.entries(colors)) {
  lines.push(`.fleet-find-parts-stitch .bg-${name} { background-color: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .text-${name} { color: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .border-${name} { border-color: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .hover\\:bg-${name}:hover { background-color: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .hover\\:text-${name}:hover { color: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .group:hover .group-hover\\:bg-${name} { background-color: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .group:hover .group-hover\\:text-${name} { color: ${value}; }`);
}

for (const [name, value] of Object.entries(space)) {
  lines.push(`.fleet-find-parts-stitch .p-${name} { padding: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .px-${name} { padding-left: ${value}; padding-right: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .py-${name} { padding-top: ${value}; padding-bottom: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .pt-${name} { padding-top: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .pb-${name} { padding-bottom: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .m-${name} { margin: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .mt-${name} { margin-top: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .mb-${name} { margin-bottom: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .my-${name} { margin-top: ${value}; margin-bottom: ${value}; }`);
  lines.push(`.fleet-find-parts-stitch .gap-${name} { gap: ${value}; }`);
}

lines.push('.dark .fleet-find-parts-stitch { background: #252525; color: #fafafa; }');
for (const [name, value] of Object.entries(dark)) {
  lines.push(`.dark .fleet-find-parts-stitch .bg-${name} { background-color: ${value}; }`);
  lines.push(`.dark .fleet-find-parts-stitch .text-${name} { color: ${value}; }`);
  lines.push(`.dark .fleet-find-parts-stitch .border-${name} { border-color: ${value}; }`);
}
lines.push('.fleet-find-parts-stitch .find-parts-stepbar, .fleet-find-parts-stitch .find-parts-trail { overflow-x: auto; }');
lines.push('@media (max-width: 420px) { .fleet-find-parts-stitch .find-parts-columns { display: flex; flex-direction: column; } }');

const out = join(import.meta.dirname, '..', 'apps', 'fleet', 'src', 'components', 'vehicles', 'find-parts', 'findParts.css');
writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`wrote ${lines.length} rules`);
