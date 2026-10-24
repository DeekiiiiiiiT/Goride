import fs from 'node:fs';
import path from 'node:path';

const filename = process.argv[2];
const cache = path.join('docs/stitch/roam-plug/.cache/call-generate_screen_from_text.json');
const body = JSON.parse(fs.readFileSync(cache, 'utf8'));
const text = (body.result?.content || []).map((part) => part.text || '').join('');
const name = text.match(/htmlCode":\{"name":"([^"]+)"/)?.[1];
if (!name) {
  console.log(text.slice(0, 500));
  process.exit(1);
}
const mcp = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.cursor/mcp.json'), 'utf8'));
const response = await fetch('https://stitch.googleapis.com/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-Goog-Api-Key': mcp.mcpServers.stitch.env.STITCH_API_KEY,
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'download_file', arguments: { name } },
  }),
});
const raw = (await response.text()).trim();
const payload = raw.startsWith('{') ? JSON.parse(raw) : JSON.parse(raw.split('\n').filter((line) => line.startsWith('data:')).at(-1).slice(5));
const inner = (payload.result?.content || []).map((part) => part.text || '').join('');
const parsed = JSON.parse(inner);
if (!parsed.html?.includes('<html') && !parsed.html?.includes('<!DOCTYPE')) throw new Error('no html');
fs.writeFileSync(path.join('docs/stitch/roam-plug/html', filename), parsed.html);
console.log(`OK ${filename} ${parsed.html.length} ${name}`);
