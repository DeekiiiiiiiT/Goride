// Throwaway proof run: the real owner's manual, the real specs prompt, the real DeepSeek reader.
//
// Reads the specifications chapter (PDF 524-530) out of C:/Users/deeki/Downloads/roomy-2021.pdf, exactly the way
// the worker does (cut the page, text layer first, otherwise the page PDF through the Files API), and prints the
// spec rows the reader returns. Nothing is asserted here; this is the evidence, not a test.
//
// deno run --allow-read --allow-env --allow-net --allow-write scripts/mm-specs-real.ts
import { callDeepSeekManualPageReader } from "../supabase/functions/_fleet-server/maintenance_manual_reader.ts";
import { extractPdfPage } from "../supabase/functions/_fleet-server/maintenance_manual_pdf.ts";
import {
  buildSpecsPagePrompt,
  parseSpecsPage,
} from "../supabase/functions/_fleet-server/maintenance_manual_specs_prompt.ts";
import type { ProviderCallEntry } from "../supabase/functions/_fleet-server/api_usage_logger.ts";

const envText = await Deno.readTextFile("supabase/functions/.env").catch(() => "");
const key = envText
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("DEEPSEEK_API_KEY="))
  .map((line) => line.slice("DEEPSEEK_API_KEY=".length).replace(/^["']|["']$/g, "").trim())
  .find(Boolean) ?? "";

if (!key) {
  console.error("no DEEPSEEK_API_KEY in supabase/functions/.env");
  Deno.exit(2);
}

const bytes = await Deno.readFile("C:/Users/deeki/Downloads/roomy-2021.pdf");
const pages = [524, 525, 527, 528, 529];

let cost = 0;
const reader = callDeepSeekManualPageReader(key, {
  guards: () => Promise.resolve(),
  log: (entry: ProviderCallEntry) => {
    cost += Number(entry.costUSD ?? 0);
    return Promise.resolve();
  },
});

for (const pageNo of pages) {
  const pagePdf = await extractPdfPage(bytes, pageNo);
  const prompt = buildSpecsPagePrompt({
    pageNo,
    manualTitle: "Toyota Roomy owner's manual (Japanese, 568 pages)",
    market: "JP",
  });

  const started = Date.now();
  try {
    // The low-level reader answers with the model's own JSON (the worker wraps it as { raw, reader }).
    const raw = await reader({ model: "unused", prompt, pdfBytes: pagePdf, pageNo });
    const parsed = parseSpecsPage(raw);
    console.log(`\n=== PDF ${pageNo} (${((Date.now() - started) / 1000).toFixed(1)}s) rows=${parsed.rows.length} dropped=${parsed.dropped} intervals=${parsed.intervals.length}`);
    for (const row of parsed.rows) {
      console.log(
        `  ${row.kind.padEnd(7)} ${row.key.padEnd(34)} ${JSON.stringify(row.value)}${row.appliesTo ? `  [${row.appliesTo}]` : ""}`,
      );
    }
    for (const row of parsed.intervals) {
      console.log(`  interval ${row.partAsPrinted} km=${row.normalKm} months=${row.normalMonths}`);
    }
  } catch (err) {
    console.log(`\n=== PDF ${pageNo} FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\nCost of the run: USD ${cost.toFixed(5)}`);
