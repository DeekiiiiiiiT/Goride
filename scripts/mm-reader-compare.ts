/**
 * Side-by-side of the two owner's-manual page readers, on the same pages with real API calls.
 *
 * What it does:
 *   1. Builds an 8-page owner's-manual test PDF: page 4 is a typed table, page 5 is a picture of a Japanese
 *      maintenance table (a real scan simulation, drawn by scripts/mm_reader_compare_scan.py).
 *   2. Cuts pages 4 and 5 the same way the worker does (maintenance_manual_pdf.ts).
 *   3. Sends each page to Gemini and to DeepSeek with the SAME prompt (maintenance_manual_prompt.ts), times each
 *      call, records the tokens the readers log, and prices them with api_pricing.ts.
 *   4. Prints the rows each reader found and every number that differs, per page.
 *
 * Run from C:/Roam/Goride-mm3:
 *   deno run --allow-read --allow-write --allow-env --allow-run --allow-net scripts/mm-reader-compare.ts
 *
 * Keys: read from the process environment, then supabase/functions/.env, then supabase/.env.local, then
 * C:/Roam/Goride/.env.local. They are never printed. A missing DeepSeek key is reported, not invented.
 */
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import { extractPdfPage } from "../supabase/functions/_fleet-server/maintenance_manual_pdf.ts";
import {
  callDeepSeekManualPageReader,
  callGeminiManualPageReader,
  MANUAL_READ_MODEL,
} from "../supabase/functions/_fleet-server/maintenance_manual_reader.ts";
import {
  buildManualPagePrompt,
  type ParsedManualRow,
  parseManualPage,
} from "../supabase/functions/_fleet-server/maintenance_manual_prompt.ts";
import { estimateCostUSD } from "../supabase/functions/_fleet-server/api_pricing.ts";
import type { ProviderCallEntry } from "../supabase/functions/_fleet-server/api_usage_logger.ts";

const MANUAL_TITLE = "Toyota Roomy owner's manual (test manual)";
const MARKET = "JM";

const TYPED_ROWS: Array<[string, string, string, string, string]> = [
  ["Part", "Normal km", "Normal months", "Severe km", "Severe months"],
  ["Engine oil", "10,000", "12", "5,000", "6"],
  ["Engine oil filter", "10,000", "12", "5,000", "6"],
  ["Spark plugs", "100,000", "60", "-", "-"],
  ["Brake fluid", "40,000", "24", "20,000", "12"],
  ["Coolant", "50,000", "48", "25,000", "24"],
  ["Air cleaner", "30,000", "24", "15,000", "12"],
];

// ---------------------------------------------------------------------------
// Environment (values are never logged)
// ---------------------------------------------------------------------------

function parseEnvFile(path: string): Map<string, string> {
  const out = new Map<string, string>();
  let text = "";
  try {
    text = Deno.readTextFileSync(path);
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (value) out.set(match[1], value);
  }
  return out;
}

function keyFor(name: string): string | null {
  const fromEnv = (Deno.env.get(name) ?? "").trim();
  if (fromEnv) return fromEnv;
  for (const path of [
    "supabase/functions/.env",
    "supabase/.env.local",
    "C:/Roam/Goride/.env.local",
  ]) {
    const fromFile = (parseEnvFile(path).get(name) ?? "").trim();
    if (fromFile) return fromFile;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The 8-page test manual
// ---------------------------------------------------------------------------

async function buildManual(page5Png: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595, 842];
  for (let i = 1; i <= 8; i += 1) {
    const page = doc.addPage(A4);
    page.drawText(`Maintenance test manual — page ${i}`, {
      x: 48,
      y: A4[1] - 60,
      size: 14,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    });

    if (i === 1) {
      page.drawText("Owner's manual (made up for the reader comparison)", {
        x: 48,
        y: A4[1] - 120,
        size: 20,
        font: bold,
      });
      page.drawText("Pages 4 and 5 hold the maintenance tables that are read.", {
        x: 48,
        y: A4[1] - 150,
        size: 12,
        font,
      });
    }

    if (i === 4) {
      page.drawText("Scheduled maintenance — distances and months", {
        x: 48,
        y: A4[1] - 110,
        size: 13,
        font: bold,
      });
      const x = [48, 240, 330, 420, 505];
      TYPED_ROWS.forEach((row, rowIndex) => {
        const y = A4[1] - 150 - rowIndex * 26;
        row.forEach((cell, colIndex) => {
          page.drawText(cell, { x: x[colIndex], y, size: 10, font });
        });
      });
    }

    if (i === 5) {
      const image = await doc.embedPng(page5Png);
      page.drawImage(image, {
        x: 40,
        y: 60,
        width: A4[0] - 80,
        height: (A4[0] - 80) * (image.height / image.width),
      });
    }
  }

  return await doc.save();
}

// ---------------------------------------------------------------------------
// One reader on one page
// ---------------------------------------------------------------------------

type ReaderRun = {
  reader: string;
  ok: boolean;
  error: string | null;
  rows: ParsedManualRow[];
  dropped: number;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  calls: number;
};

async function runReader(
  reader: "gemini" | "deepseek",
  pageNo: number,
  prompt: string,
  pdfBytes: Uint8Array,
): Promise<ReaderRun> {
  const logged: ProviderCallEntry[] = [];
  // The comparison measures the readers only: the shared budget/kill-switch guards are not part of it (no
  // database here), but the call log is, so the tokens and the cost are the real ones.
  const readWithLog = reader === "gemini"
    ? callGeminiManualPageReader(keyFor("GEMINI_API_KEY") ?? "", {
      guards: () => Promise.resolve(),
      log: (entry) => {
        logged.push(entry);
        return Promise.resolve();
      },
    })
    : callDeepSeekManualPageReader(keyFor("DEEPSEEK_API_KEY") ?? "", {
      guards: () => Promise.resolve(),
      log: (entry) => {
        logged.push(entry);
        return Promise.resolve();
      },
    });

  const started = performance.now();
  try {
    const raw = await readWithLog({ model: MANUAL_READ_MODEL, prompt, pdfBytes, pageNo });
    const ms = Math.round(performance.now() - started);
    const parsed = parseManualPage(raw);
    return {
      reader,
      ok: true,
      error: null,
      rows: parsed.rows,
      dropped: parsed.dropped,
      ms,
      inputTokens: logged.reduce((n, e) => n + (e.inputTokens ?? 0), 0),
      outputTokens: logged.reduce((n, e) => n + (e.outputTokens ?? 0), 0),
      costUsd: logged.reduce(
        (n, e) =>
          n + estimateCostUSD(e.provider, e.model, e.service, {
            inputTokens: e.inputTokens,
            outputTokens: e.outputTokens,
            requests: e.requests,
          }),
        0,
      ),
      calls: logged.length,
    };
  } catch (err) {
    return {
      reader,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      rows: [],
      dropped: 0,
      ms: Math.round(performance.now() - started),
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      calls: logged.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Comparing the two answers
// ---------------------------------------------------------------------------

const NUMBER_FIELDS: Array<{ key: keyof ParsedManualRow; label: string }> = [
  { key: "normalKm", label: "normal km" },
  { key: "normalMonths", label: "normal months" },
  { key: "severeKm", label: "severe km" },
  { key: "severeMonths", label: "severe months" },
  { key: "firstKm", label: "first km" },
  { key: "firstMonths", label: "first months" },
];

function byPart(rows: ParsedManualRow[]): Map<string, ParsedManualRow> {
  const map = new Map<string, ParsedManualRow>();
  for (const row of rows) {
    const key = row.partAsPrinted.toLowerCase().replace(/\s+/g, " ").trim();
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

function differences(a: ParsedManualRow[], b: ParsedManualRow[]): string[] {
  const left = byPart(a);
  const right = byPart(b);
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  const out: string[] = [];
  for (const key of keys) {
    const one = left.get(key);
    const two = right.get(key);
    if (!one) {
      out.push(`only in the second reader: "${key}"`);
      continue;
    }
    if (!two) {
      out.push(`only in the first reader: "${key}"`);
      continue;
    }
    for (const field of NUMBER_FIELDS) {
      if (one[field.key] !== two[field.key]) {
        out.push(`"${key}" ${field.label}: ${String(one[field.key])} vs ${String(two[field.key])}`);
      }
    }
    if (one.oneFigure !== two.oneFigure) {
      out.push(`"${key}" one_figure: ${String(one.oneFigure)} vs ${String(two.oneFigure)}`);
    }
  }
  return out;
}

function summary(run: ReaderRun): string {
  if (!run.ok) return `FAILED in ${run.ms} ms — ${run.error}`;
  return `${run.rows.length} rows (${run.dropped} dropped) in ${run.ms} ms · ` +
    `${run.inputTokens} in / ${run.outputTokens} out tokens · $${run.costUsd.toFixed(6)} · ${run.calls} call(s)`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const tempDir = await Deno.makeTempDir({ prefix: "mm-reader-compare-" });
const pngPath = `${tempDir}/page-5-scan.png`;
const python = "C:/Users/deeki/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe";

const pythonRun = await new Deno.Command(python, {
  args: ["scripts/mm_reader_compare_scan.py", pngPath],
}).output();
if (!pythonRun.success) {
  console.error(new TextDecoder().decode(pythonRun.stderr));
  throw new Error("the scanned page could not be drawn");
}

const pdf = await buildManual(await Deno.readFile(pngPath));
const pdfPath = `${tempDir}/maintenance-test-manual.pdf`;
await Deno.writeFile(pdfPath, pdf);

const hasGemini = Boolean(keyFor("GEMINI_API_KEY"));
const hasDeepSeek = Boolean(keyFor("DEEPSEEK_API_KEY"));

console.log(`Test manual: ${pdfPath}`);
console.log(`GEMINI_API_KEY: ${hasGemini ? "present" : "MISSING"}`);
console.log(`DEEPSEEK_API_KEY: ${hasDeepSeek ? "present" : "MISSING"}`);
console.log("");

const results: Array<{ pageNo: number; label: string; readers: ReaderRun[] }> = [];

for (const pageNo of [4, 5]) {
  const label = pageNo === 4 ? "typed table (English)" : "scanned picture of a Japanese table";
  const pagePdf = await extractPdfPage(pdf, pageNo);
  const prompt = buildManualPagePrompt({ pageNo, manualTitle: MANUAL_TITLE, market: MARKET });

  console.log(`=== Page ${pageNo} — ${label} ===`);
  const readers: ReaderRun[] = [];
  for (const reader of ["gemini", "deepseek"] as const) {
    const hasKey = reader === "gemini" ? hasGemini : hasDeepSeek;
    if (!hasKey) {
      console.log(`${reader.padEnd(9)} SKIPPED — its API key is not configured`);
      continue;
    }
    const run = await runReader(reader, pageNo, prompt, pagePdf);
    console.log(`${reader.padEnd(9)} ${summary(run)}`);
    readers.push(run);
  }

  const gemini = readers.find((r) => r.reader === "gemini");
  if (gemini?.ok) {
    console.log("Gemini rows:");
    for (const row of gemini.rows) {
      console.log(
        `  - ${row.partAsPrinted} | ${row.normalKm ?? "-"} km / ${row.normalMonths ?? "-"} mo` +
          ` | severe ${row.severeKm ?? "-"} km / ${row.severeMonths ?? "-"} mo` +
          ` | one_figure=${row.oneFigure} | ${row.confidence}`,
      );
    }
  }
  const deepseek = readers.find((r) => r.reader === "deepseek");
  if (deepseek?.ok) {
    console.log("DeepSeek rows:");
    for (const row of deepseek.rows) {
      console.log(
        `  - ${row.partAsPrinted} | ${row.normalKm ?? "-"} km / ${row.normalMonths ?? "-"} mo` +
          ` | severe ${row.severeKm ?? "-"} km / ${row.severeMonths ?? "-"} mo` +
          ` | one_figure=${row.oneFigure} | ${row.confidence}`,
      );
    }
  }

  if (gemini?.ok && deepseek?.ok) {
    const diffs = differences(gemini.rows, deepseek.rows);
    console.log(diffs.length ? `Differences (Gemini vs DeepSeek):` : "Differences: none");
    for (const line of diffs) console.log(`  ! ${line}`);
  } else if (gemini?.ok || deepseek?.ok) {
    console.log("Differences: cannot compare — one reader did not answer.");
  }
  console.log("");
  results.push({ pageNo, label, readers });
}

const summaryPath = `${tempDir}/summary.json`;
await Deno.writeTextFile(
  summaryPath,
  JSON.stringify(
    results.map((page) => ({
      page: page.pageNo,
      label: page.label,
      readers: page.readers.map((r) => ({
        reader: r.reader,
        ok: r.ok,
        error: r.error,
        rows: r.rows,
        dropped: r.dropped,
        ms: r.ms,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsd: r.costUsd,
      })),
    })),
    null,
    2,
  ),
);
console.log(`Full JSON: ${summaryPath}`);
