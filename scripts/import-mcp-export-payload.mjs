#!/usr/bin/env node
/**
 * Extract JSON payload from Supabase MCP execute_sql output file(s).
 * Usage: node scripts/import-mcp-export-payload.mjs <file1> [file2...] > merged.json
 */
import { readFileSync } from 'node:fs';

function extractPayload(raw) {
  const marker = raw.indexOf('[{"payload"');
  if (marker < 0) {
    const alt = raw.indexOf('[{"version"');
    if (alt < 0) throw new Error('no JSON array in input');
    const end = raw.lastIndexOf('}]');
    return JSON.parse(raw.slice(alt, end + 2));
  }
  const end = raw.lastIndexOf('}]');
  const outer = JSON.parse(raw.slice(marker, end + 2));
  if (Array.isArray(outer) && outer[0]?.payload) return outer[0].payload;
  if (outer.payload) return outer.payload;
  return outer;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/import-mcp-export-payload.mjs <mcp-output.txt> ...');
  process.exit(1);
}

function mcpFileToInner(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.includes('"result"')) {
    const parsed = JSON.parse(trimmed);
    const result = String(parsed.result ?? '');
    const untrustedStart = result.indexOf('<untrusted-data');
    if (untrustedStart >= 0) {
      const dataStart = result.indexOf('\n', untrustedStart) + 1;
      const dataEnd = result.indexOf('</untrusted-data', dataStart);
      return result.slice(dataStart, dataEnd);
    }
    return result;
  }
  const untrustedStart = raw.indexOf('<untrusted-data');
  if (untrustedStart >= 0) {
    const dataStart = raw.indexOf('\n', untrustedStart) + 1;
    const dataEnd = raw.indexOf('</untrusted-data', dataStart);
    return raw.slice(dataStart, dataEnd);
  }
  return raw;
}

const merged = [];
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  merged.push(...extractPayload(mcpFileToInner(raw)));
}

process.stdout.write(JSON.stringify(merged, null, 2));
