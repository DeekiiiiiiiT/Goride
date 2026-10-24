import fs from 'node:fs';
const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');
const titles = [...text.matchAll(/"title":"([^"]+)"/g)].map((m) => m[1]);
const ids = [...text.matchAll(/"id":"([a-f0-9]{32})"/g)].map((m) => m[1]);
const htmls = [...text.matchAll(/htmlCode":\{"name":"([^"]+)"/g)].map((m) => m[1]);
const n = Math.max(titles.length, ids.length, htmls.length);
for (let i = 0; i < n; i += 1) console.log([titles[i], ids[i], htmls[i]].join(' | '));
