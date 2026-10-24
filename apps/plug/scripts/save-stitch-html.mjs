import fs from 'node:fs';

const [source, dest] = process.argv.slice(2);
const raw = fs.readFileSync(source, 'utf8');
let html = raw;
if (raw.trim().startsWith('{')) {
  const data = JSON.parse(raw);
  html = data.html || data.result?.html || '';
}
if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
  throw new Error(`No HTML in ${source}`);
}
fs.writeFileSync(dest, html);
console.log(`${dest} ${html.length}`);
