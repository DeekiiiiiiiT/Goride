import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const projectId = '7833067736952351487';
const outDir = path.join(root, 'docs/stitch/roam-plug/html');
const mcp = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.cursor/mcp.json'), 'utf8'));
const apiKey = mcp.mcpServers.stitch.env.STITCH_API_KEY;

const screens = [
  ['projects/7833067736952351487/files/c48e148064d14cd5859709d4db8efa5e', 'D1-review-queue.html'],
  ['projects/7833067736952351487/files/f6eaf96a41614f39ae22d660fd1382e3', 'D3-merge.html'],
  ['projects/7833067736952351487/files/4ac516a0b3f04d4a80e1414213318d65', '15b-explore-loading.html'],
  ['projects/7833067736952351487/files/7f8d34327b0644caafff1ef0b25f9dc5', '43c-poor-gps.html'],
  ['projects/7833067736952351487/files/b25cf0fef4cd48c4bca43a828bb0472e', '19b-directions.html'],
  ['projects/7833067736952351487/files/4e954afef866462d9d1d0c9246bdadc4', '15c-empty-map.html'],
  ['projects/7833067736952351487/files/5f67e2128930443ebe774e7cbd484f5d', '49b-empty-search.html'],
  ['projects/7833067736952351487/files/4f7653d1c44f458295649e028f65bca4', '29b-empty-garage.html'],
  ['projects/7833067736952351487/files/8deae1cf28784b12932ce4735da78be1', '50b-empty-inbox.html'],
  ['projects/7833067736952351487/files/3fe2329efbc5482a8289ed150c17cfe0', '27b-first-save.html'],
  ['projects/7833067736952351487/files/b70c38243b894f3cb4439f6e568f6505', '45c-submitted-toast.html'],
  ['projects/7833067736952351487/files/7766e3cc610a48f89136bd78e7ddd122', '46b-approved.html'],
  ['projects/7833067736952351487/files/b3f5d9aa391a4972969128d175ddd11d', '26b-save-error.html'],
  ['projects/7833067736952351487/files/5cdc4f5ac7374fe4bd72f54422a892da', '30b-remove-vehicle.html'],
  ['projects/7833067736952351487/files/2efb00d295da43909aac13564dee38a9', '23b-withdraw.html'],
  ['projects/7833067736952351487/files/6e1662f379684c36940d3b0c42021a30', '15d-offline-chip.html'],
];

function unwrap(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const chunks = trimmed.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim());
  return JSON.parse(chunks.at(-1) || '{}');
}

async function download(name) {
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
      params: { name: 'download_file', arguments: { name } },
    }),
  });
  const body = unwrap(await response.text());
  if (body.error) throw new Error(body.error.message || 'stitch error');
  const content = body.result?.content || [];
  const text = content.map((part) => part.text || '').join('');
  const parsed = text.trim().startsWith('{') ? JSON.parse(text) : null;
  const html = parsed?.html || parsed?.result?.html || text;
  if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
    throw new Error(`no html (${html.slice(0, 80)})`);
  }
  return html;
}

fs.mkdirSync(outDir, { recursive: true });
const failures = [];
for (const [id, filename] of screens) {
  try {
    const html = await download(id);
    fs.writeFileSync(path.join(outDir, filename), html, 'utf8');
    console.log(`OK ${filename} ${html.length}`);
  } catch (error) {
    failures.push(`${filename}: ${error.message}`);
    console.log(`FAIL ${filename}: ${error.message}`);
  }
}
if (failures.length) process.exitCode = 1;
