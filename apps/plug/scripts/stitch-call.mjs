import fs from 'node:fs';
import path from 'node:path';

const mcp = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.cursor/mcp.json'), 'utf8'));
const apiKey = mcp.mcpServers.stitch.env.STITCH_API_KEY;

function unwrap(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const chunks = trimmed.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).filter(Boolean);
  return JSON.parse(chunks.at(-1) || '{}');
}

const tool = process.argv[2];
const raw = process.argv[3] || '{}';
const args = raw.endsWith('.json') ? JSON.parse(fs.readFileSync(raw, 'utf8')) : JSON.parse(raw);
const response = await fetch('https://stitch.googleapis.com/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-Goog-Api-Key': apiKey,
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: tool, arguments: args },
  }),
  signal: AbortSignal.timeout(280000),
});
const body = unwrap(await response.text());
const out = path.join('docs/stitch/roam-plug/.cache', `call-${tool}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(body));
const text = (body.result?.content || []).map((part) => part.text || '').join('');
const titles = [...text.matchAll(/"title":"([^"]+)"/g)].map((match) => match[1]);
const ids = [...text.matchAll(/"id":"([a-f0-9]{32})"/g)].map((match) => match[1]);
console.log(body.error ? `ERROR ${body.error.message}` : `ok titles ${titles.length}`);
titles.forEach((title, index) => console.log(`${title} | ${ids[index] || ''}`));
if (!titles.length) console.log(text.slice(0, 400));
