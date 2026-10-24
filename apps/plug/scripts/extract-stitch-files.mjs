import fs from 'node:fs';

const files = process.argv.slice(2);
const seen = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /htmlCode":\{"name":"(projects\/7833067736952351487\/files\/[a-f0-9]+)"/g;
  for (const match of text.matchAll(re)) {
    const name = match[1];
    const window = text.slice(Math.max(0, match.index - 400), match.index + 500);
    const title = window.match(/"title":"([^"]+)"/)?.[1] || '';
    const id = window.match(/"id":"([a-f0-9]{32})"/)?.[1] || '';
    if (!seen.has(name)) seen.set(name, { title, id });
  }
}
for (const [name, meta] of seen) {
  console.log([meta.title, meta.id, name].join(' | '));
}
