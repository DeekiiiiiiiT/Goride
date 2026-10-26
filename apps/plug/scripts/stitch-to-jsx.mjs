import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readingViolations, sampleViolations, sanitizePlugScreen } from './plug-samples.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const htmlDir = path.join(root, 'docs/stitch/roam-plug/html');
const outDir = path.join(root, 'apps/plug/src/screens/generated');
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const SKIP = new Set(['43b-place-pin-variant.html', '45b-submitted-variant.html']);
const CLOSE_BODY = `<${'/body>'}`;
const CLOSE_SCRIPT = `<${'/script>'}`;

const ATTR = {
  class: 'className',
  for: 'htmlFor',
  viewbox: 'viewBox',
  preserveaspectratio: 'preserveAspectRatio',
  tabindex: 'tabIndex',
  maxlength: 'maxLength',
  minlength: 'minLength',
  srcset: 'srcSet',
  crossorigin: 'crossOrigin',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  readonly: 'readOnly',
  inputmode: 'inputMode',
  datetime: 'dateTime',
  novalidate: 'noValidate',
  playsinline: 'playsInline',
  fetchpriority: 'fetchPriority',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  patternunits: 'patternUnits',
  patterncontentunits: 'patternContentUnits',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
  patterntransform: 'patternTransform',
  maskunits: 'maskUnits',
  clippathunits: 'clipPathUnits',
  'stroke-miterlimit': 'strokeMiterlimit',
};

const SVG_TAGS = {
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  clippath: 'clipPath',
  clippathunits: 'clipPath',
};

const BOOL_ATTR = new Set(['checked', 'defaultChecked', 'disabled', 'readOnly', 'required', 'selected', 'multiple', 'autoFocus', 'noValidate', 'playsInline']);
const NUM_ATTR = new Set(['tabIndex', 'maxLength', 'minLength', 'rows', 'cols', 'span', 'colSpan', 'rowSpan', 'size', 'step']);

function decode(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function readTag(html, i) {
  const close = html[i + 1] === '/';
  let j = i + 1 + (close ? 1 : 0);
  while (j < html.length && /[a-zA-Z0-9:-]/.test(html[j])) j += 1;
  const name = html.slice(i + 1 + (close ? 1 : 0), j).toLowerCase();
  const attrs = {};
  while (j < html.length && html[j] !== '>') {
    while (j < html.length && /\s/.test(html[j])) j += 1;
    if (html[j] === '>' || html[j] === '/') break;
    const keyStart = j;
    while (j < html.length && /[^\s=>/]/.test(html[j])) j += 1;
    const key = html.slice(keyStart, j).toLowerCase();
    while (j < html.length && /\s/.test(html[j])) j += 1;
    if (html[j] === '=') {
      j += 1;
      while (j < html.length && /\s/.test(html[j])) j += 1;
      let val = '';
      if (html[j] === '"' || html[j] === "'") {
        const quote = html[j];
        j += 1;
        const end = html.indexOf(quote, j);
        val = html.slice(j, end < 0 ? html.length : end);
        j = end < 0 ? html.length : end + 1;
      } else {
        const start = j;
        while (j < html.length && !/[\s>]/.test(html[j])) j += 1;
        val = html.slice(start, j);
      }
      if (key && !key.startsWith('on')) attrs[key] = decode(val);
    } else if (key && !key.startsWith('on')) attrs[key] = true;
  }
  const self = html[j] === '/' || VOID.has(name);
  if (html[j] === '/') j += 1;
  if (html[j] === '>') j += 1;
  return { name, attrs, close, self, next: j };
}

function parseFragment(html, start, until) {
  const nodes = [];
  let i = start;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[i] !== '<') {
      const next = html.indexOf('<', i);
      const raw = html.slice(i, next < 0 ? html.length : next);
      i = next < 0 ? html.length : next;
      const value = decode(raw);
      if (value.trim()) nodes.push({ type: 'text', value });
      continue;
    }
    const lower = html.slice(i, i + until.length + 2).toLowerCase();
    if (lower === `</${until}`) {
      const end = html.indexOf('>', i);
      return { nodes, next: end < 0 ? html.length : end + 1 };
    }
    const tag = readTag(html, i);
    if (tag.close) {
      if (tag.name === until) return { nodes, next: tag.next };
      i = tag.next;
      continue;
    }
    i = tag.next;
    if (tag.name === 'script' || tag.name === 'style') {
      const end = html.toLowerCase().indexOf(`</${tag.name}>`, i);
      i = end < 0 ? html.length : end + tag.name.length + 3;
      continue;
    }
    const children = tag.self ? { nodes: [], next: i } : parseFragment(html, i, tag.name);
    i = children.next;
    nodes.push({ type: 'el', name: tag.name, attrs: tag.attrs, children: children.nodes });
  }
  return { nodes, next: i };
}

function componentName(file) {
  const slug = file.replace(/\.html$/, '').replace(/^\d+[a-z]?-/, '');
  const name = slug.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  return `${name}Screen`;
}

function walk(node, visit) {
  if (!node || node.type !== 'el') return;
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}

function iconText(node) {
  const found = [];
  walk(node, (el) => {
    if (String(el.attrs.class || '').includes('material-symbols-outlined')) {
      const text = (el.children || []).filter((child) => child.type === 'text').map((child) => child.value).join('').trim();
      if (text) found.push(text);
    }
  });
  return found;
}

function plainText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  if (node.type !== 'el') return '';
  if (String(node.attrs.class || '').includes('material-symbols-outlined')) return '';
  return (node.children || []).map(plainText).join(' ');
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'tap';
}

function prepare(file, body) {
  body.children = (body.children || []).filter((child) => {
    if (child.type !== 'el') return true;
    const cls = String(child.attrs.class || '');
    return !(child.name === 'nav' && cls.includes('bottom-0'));
  });
  const used = new Set();
  walk(body, (el) => {
    const cls = String(el.attrs.class || '');
    if (file === '15-home-explore.html' && cls.includes('h-[512px]')) {
      el.children = [{ type: 'component', name: 'ExploreMap' }];
      used.add('ExploreMap');
    }
    if (file === '15-home-explore.html' && cls.includes('rounded-t-3xl') && cls.includes('-mt-4')) {
      el.replace = 'ExploreSheet';
      used.add('ExploreSheet');
    }
    if (file === '43-place-pin.html' && cls.includes('bg-[#ebe7df]')) {
      el.children = [{ type: 'component', name: 'PinMap' }, ...(el.children || []).filter((child) => child.name !== 'svg')];
      used.add('PinMap');
    }
  });
  if (file === '49-search.html') {
    const header = body.children.find((child) => child.type === 'el' && child.name === 'header');
    body.children = [header, { type: 'component', name: 'SearchBody' }].filter(Boolean);
    used.add('SearchBody');
  }
  if (file === '54-settings.html') {
    body.children.push({ type: 'component', name: 'DemoSettingsRow' });
    used.add('DemoSettingsRow');
  }
  const seen = new Map();
  walk(body, (el) => {
    const interactive = el.name === 'button' || el.name === 'a' || el.attrs.role === 'button' || el.attrs['data-make']
      || (el.name === 'input' && /search/i.test(String(el.attrs.placeholder || el.attrs['aria-label'] || '')));
    if (!interactive) return;
    const icons = iconText(el);
    const label = plainText(el).replace(/\s+/g, ' ').trim();
    const voice = /voice search/i.test(String(el.attrs['aria-label'] || '')) || (icons.length === 1 && icons[0] === 'mic' && label.length < 2);
    if (voice) {
      el.attrs.disabled = true;
      el.attrs.title = 'Voice search is not in this version';
      return;
    }
    const base = String(el.attrs.id || slug(label || icons[0] || el.name));
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    el.attrs['data-act'] = count === 1 ? base : `${base}-${count}`;
    el.wire = true;
    const aria = `${el.attrs['aria-label'] || ''} ${label} ${icons[0] || ''}`;
    if (/arrow_back|go back|^back$/i.test(aria) || icons[0] === 'arrow_back' || icons[0] === 'close') el.attrs['data-way-out'] = 'back';
    else if (String(el.attrs.class || '').includes('bg-primary') || /get started|save|continue|verify/i.test(label)) el.attrs['data-way-out'] = 'primary';
  });
  return used;
}

function attrName(key) {
  if (ATTR[key]) return ATTR[key];
  if (key.startsWith('aria-') || key.startsWith('data-')) return key;
  if (key.includes('-')) return key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return key;
}

function emitStyle(value) {
  const fields = String(value).split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const split = part.indexOf(':');
    const key = part.slice(0, split).trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return `${key}: ${JSON.stringify(part.slice(split + 1).trim())}`;
  });
  return `{{ ${fields.join(', ')} }}`;
}

function emitAttrs(el) {
  const chunks = [];
  if (el.wire) chunks.push('onClick={onPlugClick}');
  for (const [key, value] of Object.entries(el.attrs || {})) {
    let name = attrName(key);
    if ((el.name === 'input' || el.name === 'textarea') && name === 'value') name = 'defaultValue';
    if (el.name === 'input' && (name === 'checked' || key === 'checked')) name = 'defaultChecked';
    if (name === 'style' && typeof value === 'string') {
      chunks.push(`style=${emitStyle(value)}`);
      continue;
    }
    if (value === true || (BOOL_ATTR.has(name) && (value === '' || value === 'checked' || value === 'true'))) {
      chunks.push(`${name}={true}`);
      continue;
    }
    if (NUM_ATTR.has(name) && /^-?\d+$/.test(String(value))) {
      chunks.push(`${name}={${Number(value)}}`);
      continue;
    }
    chunks.push(`${name}={${JSON.stringify(String(value))}}`);
  }
  return chunks.join(' ');
}

function emit(node, indent) {
  if (!node || node.drop) return '';
  if (node.type === 'text') {
    const value = node.value.replace(/\s+/g, ' ').trim();
    if (!value) return '';
    if (/[{}<>&]/.test(value)) return `${indent}{${JSON.stringify(value)}}\n`;
    return `${indent}${value}\n`;
  }
  if (node.type === 'component') return `${indent}<${node.name} />\n`;
  if (node.replace) return `${indent}<${node.replace} />\n`;
  const tag = SVG_TAGS[node.name] || node.name;
  const attrs = emitAttrs(node);
  const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
  if (VOID.has(node.name)) return `${indent}${open.slice(0, -1)} />\n`;
  const inner = (node.children || []).map((child) => emit(child, `${indent}  `)).join('');
  if (!inner.trim()) return `${indent}${open.slice(0, -1)} />\n`;
  return `${indent}${open}\n${inner}${indent}</${tag}>\n`;
}

function emitFile(file, body, used) {
  const name = componentName(file);
  const rendered = (body.children || []).map((child) => emit(child, '      ')).join('');
  const needsClick = rendered.includes('onClick={onPlugClick}');
  const extra = [];
  if (used.has('ExploreMap') || used.has('PinMap')) {
    const names = ['ExploreMap', 'PinMap'].filter((item) => used.has(item));
    extra.push(`import { ${names.join(', ')} } from '../../live/maps';`);
  }
  if (used.has('ExploreSheet')) extra.push(`import { ExploreSheet } from '../../live/ExploreSheet';`);
  if (used.has('SearchBody')) extra.push(`import { SearchBody } from '../../shell/bind';`);
  if (used.has('DemoSettingsRow')) extra.push(`import { DemoSettingsRow } from '../../shell/chrome';`);
  const bodyAttrs = emitAttrs({ name: 'div', wire: false, attrs: body.attrs });
  const source = `import { useEffect, useRef } from 'react';
${needsClick ? `import { onPlugClick } from '../../shell/actions';\n` : ''}import { bindScreen } from '../../shell/bind';
${extra.join('\n')}

export function ${name}() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen(${JSON.stringify(file)}, ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={${JSON.stringify(file)}} ${bodyAttrs}>
${rendered}    </div>
  );
}
`;
  const clean = sanitizePlugScreen(source, `${name}.tsx`);
  const banned = [...sampleViolations(clean), ...readingViolations(clean)];
  if (banned.length) {
    console.error(`${name} still has sample content: ${banned.join(', ')}`);
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), clean);
  return name;
}

function extractConfig(html) {
  const start = html.indexOf('tailwind.config');
  if (start < 0) return null;
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        try { return Function(`"use strict"; return (${html.slice(brace, i + 1)});`)(); } catch { return null; }
      }
    }
  }
  return null;
}

function writeCss(fileNames) {
  const colors = {};
  const spacing = {};
  const fontFamily = {};
  const fontSize = {};
  for (const file of fileNames) {
    const config = extractConfig(fs.readFileSync(path.join(htmlDir, file), 'utf8'));
    const extend = config?.theme?.extend || {};
    Object.assign(colors, extend.colors || {});
    Object.assign(spacing, extend.spacing || {});
    Object.assign(fontFamily, extend.fontFamily || {});
    Object.assign(fontSize, extend.fontSize || {});
  }
  const lines = ['/* Roam Plug — Stitch palette. Import only from apps/plug. */', '@theme {'];
  for (const [name, value] of Object.entries(colors)) {
    if (typeof value === 'string') lines.push(`  --color-${name}: ${value};`);
    else if (value && typeof value === 'object') {
      for (const [child, nested] of Object.entries(value)) {
        if (typeof nested !== 'string') continue;
        const token = child === 'DEFAULT' ? name : `${name}-${child}`;
        lines.push(`  --color-${token}: ${nested};`);
      }
    }
  }
  lines.push('  --color-primary-press: #7f2b00;');
  lines.push('  --color-success: #16a34a;');
  lines.push('  --color-warning: #d97706;');
  lines.push('  --color-neutral: #57534e;');
  lines.push('  --color-line: #e2bfb2;');
  lines.push('  --color-grade-87: #16a34a;');
  lines.push('  --color-grade-90: #dc2626;');
  lines.push('  --color-grade-diesel: #1c1917;');
  lines.push('  --color-pending: #57534e;');
  lines.push('  --font-sans: Inter, "Segoe UI", system-ui, sans-serif;');
  for (const [name, family] of Object.entries(fontFamily)) {
    const stack = Array.isArray(family) ? family.join(', ') : family;
    lines.push(`  --font-${name}: ${stack}, "Segoe UI", system-ui, sans-serif;`);
  }
  for (const [name, size] of Object.entries(fontSize)) {
    const [px, extra] = size;
    lines.push(`  --text-${name}: ${px};`);
    if (extra?.lineHeight) lines.push(`  --text-${name}--line-height: ${extra.lineHeight};`);
    if (extra?.letterSpacing) lines.push(`  --text-${name}--letter-spacing: ${extra.letterSpacing};`);
    if (extra?.fontWeight) lines.push(`  --text-${name}--font-weight: ${extra.fontWeight};`);
  }
  for (const [name, value] of Object.entries(spacing)) lines.push(`  --spacing-${name}: ${value};`);
  lines.push('}');
  lines.push(`
.dark {
  --color-surface: #1e1b17;
  --color-background: #1e1b17;
  --color-on-surface: #fff8f2;
  --color-on-background: #fff8f2;
  --color-surface-container-lowest: #2a2622;
  --color-surface-container-low: #332e29;
  --color-surface-container: #3a342e;
  --color-surface-container-high: #443e37;
  --color-surface-container-highest: #4e473f;
  --color-surface-bright: #1e1b17;
  --color-surface-dim: #141210;
  --color-surface-variant: #4e473f;
  --color-on-surface-variant: #e2bfb2;
  --color-inverse-surface: #fff8f2;
  --color-inverse-on-surface: #1e1b17;
  --color-outline: #a08b82;
  --color-outline-variant: #5a4138;
  --color-primary: #ffb599;
  --color-on-primary: #370e00;
  --color-line: #5a4138;
  --color-neutral: #d6d3d1;
}
`);
  fs.writeFileSync(path.join(root, 'packages/design-tokens/plug.css'), `${lines.join('\n')}\n`);
}

const files = fs.readdirSync(htmlDir).filter((file) => file.endsWith('.html') && !file.startsWith('D') && !SKIP.has(file));
fs.mkdirSync(outDir, { recursive: true });
writeCss(files);
const names = [];
for (const file of files) {
  const html = fs.readFileSync(path.join(htmlDir, file), 'utf8');
  const bodyAt = html.toLowerCase().indexOf('<body');
  const bodyEnd = html.toLowerCase().lastIndexOf(CLOSE_BODY);
  if (bodyAt < 0 || bodyEnd < 0) {
    console.error('no body', file);
    continue;
  }
  const openEnd = html.indexOf('>', bodyAt);
  const attrs = html.slice(bodyAt + 5, openEnd);
  const inner = html.slice(openEnd + 1, bodyEnd);
  const body = { type: 'el', name: 'body', attrs: readTag(`<body${attrs}>`, 0).attrs, children: parseFragment(inner, 0, 'never-closes').nodes };
  const used = prepare(file, body);
  names.push(emitFile(file, body, used));
  console.log(names[names.length - 1]);
}
fs.writeFileSync(path.join(outDir, 'index.ts'), `${names.map((name) => `export { ${name} } from './${name}';`).join('\n')}\n`);
console.log(`wrote ${names.length}`);
void CLOSE_SCRIPT;
