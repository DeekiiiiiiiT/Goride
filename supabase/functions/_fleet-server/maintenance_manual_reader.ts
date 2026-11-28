/**
 * Step 3+ — the one model call a manual page makes.
 *
 * Two readers:
 *   - DeepSeek (`deepseek-flash`) is the reader. When the page is typed, its own text layer is extracted here
 *     (`maintenance_manual_text.ts`) and sent in the prompt: the characters are exact, so the two printed
 *     brackets 〔 first time 〕 and 「 severe 」 are told apart instead of being read off a picture where they look
 *     the same. A scanned page has no text layer; the one-page PDF is then uploaded to the Files API with the
 *     document-parsing purpose, the chat request references that file by id, and the file is deleted as soon as
 *     the page has been read (success or failure).
 *   - Gemini reads the PDF inline (`inlineData`), exactly as step 3 shipped it, and is the check / backup.
 *
 * Both go through `trackedProviderCall`, which logs spend (provider, tokens, cost) and applies the shared pause
 * and budget rules before anything is sent. A budget pause surfaces as `ProviderBlockedError`, so the worker
 * waits and never fails the page for it.
 */
import { Buffer } from "node:buffer";
import { ProviderBlockedError, trackedProviderCall, type ProviderCallEntry } from "./api_usage_logger.ts";
import { DEEPSEEK_VISION_MODEL } from "./deepseek_models.ts";
import { GEMINI_TEXT_MODEL } from "./gemini_models.ts";
import { appendManualPageText } from "./maintenance_manual_prompt.ts";
import type { ManualReaderName } from "./maintenance_manual_settings.ts";
import { isTypedPageText, readPageText } from "./maintenance_manual_text.ts";
import type { ManualPageRead, ManualPageReadInput, ManualPageReader } from "./maintenance_manual_worker.ts";

/** A Gemini page read may take this long. */
export const MANUAL_READ_TIMEOUT_MS = 45_000;
/** One DeepSeek chat call may take this long (a page with 60 rows answers in seconds; this is the ceiling). */
export const DEEPSEEK_CHAT_TIMEOUT_MS = 25_000;
/** Uploading and parsing one page PDF may take this long. */
export const DEEPSEEK_UPLOAD_TIMEOUT_MS = 20_000;
const DEEPSEEK_DELETE_TIMEOUT_MS = 5_000;
/** The server-side expiry, so a file left behind by a killed worker is gone within the hour. */
const DEEPSEEK_FILE_TTL_SECONDS = 3600;

export const MANUAL_READ_ROUTE = "maintenance-manual-reader/page";
export const MANUAL_READ_MODEL = GEMINI_TEXT_MODEL;

export const DEEPSEEK_API_BASE = "https://api.deepseek.com";
/**
 * How a page with no text layer (a scan) is parsed. `rich_layout_recognition` gives the model the text AND the
 * page's figures at their original positions, which is what a scanned picture of a maintenance table is;
 * `text_recognition` drops the figures and loses a scanned table's columns.
 *
 * A typed page never comes this way: its own text is extracted and sent in the prompt instead, because the
 * characters matter (the printed 〔 and 「 are drawn as the same shape) and the document parser does not always
 * keep them — it has returned `80「160」` for a printed `80〔160〕`.
 */
export const DEEPSEEK_DOCUMENT_PURPOSE = "rich_layout_recognition";

/** A reader that answers with the model's raw JSON. Throws on a network/provider error or a bad answer. */
export type SinglePageReader = (input: ManualPageReadInput) => Promise<unknown>;

/**
 * The model answered, but not with JSON (or with nothing at all). Only this is worth asking DeepSeek again;
 * a failed call or a timeout goes straight to Gemini.
 */
export class ManualReaderJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualReaderJsonError";
  }
}

function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

// ---------------------------------------------------------------------------
// Gemini — the step-3 reader, unchanged in shape
// ---------------------------------------------------------------------------

type GeminiAnswer = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

export type GeminiReaderDeps = {
  /** Tests pass a fake; production uses the platform `fetch`. */
  fetchImpl?: typeof fetch;
  /** Test seams for the shared guards / call log; production leaves both out. */
  guards?: () => Promise<void>;
  log?: (entry: ProviderCallEntry) => Promise<void>;
};

/**
 * Reads one page and returns the model's JSON. Throws on a network or provider error, so the worker can decide
 * between "try again later" and "give up after three tries".
 */
export function callGeminiManualPageReader(
  apiKey: string | undefined,
  deps: GeminiReaderDeps = {},
): SinglePageReader {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return async (input) => {
    const key = (apiKey ?? "").trim();
    if (!key) throw new Error("GEMINI_API_KEY is not configured");

    const base64 = Buffer.from(input.pdfBytes).toString("base64");
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;
    const gate = timeoutSignal(MANUAL_READ_TIMEOUT_MS);

    try {
      const answer = await trackedProviderCall<GeminiAnswer>({
        provider: "gemini",
        service: "vision",
        route: MANUAL_READ_ROUTE,
        model: input.model,
        guards: deps.guards,
        log: deps.log,
        run: async () => {
          const res = await fetchImpl(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            signal: gate.signal,
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: input.prompt },
                  { inlineData: { mimeType: "application/pdf", data: base64 } },
                ],
              }],
              generationConfig: { responseMimeType: "application/json", temperature: 0 },
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 300)}`);
          }
          return await res.json() as GeminiAnswer;
        },
        extractUsage: (r) => ({
          inputTokens: r?.usageMetadata?.promptTokenCount,
          outputTokens: r?.usageMetadata?.candidatesTokenCount,
        }),
      });

      const text = answer.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text.trim()) throw new Error("The page reader answered with nothing.");
      return JSON.parse(text) as unknown;
    } finally {
      gate.done();
    }
  };
}

// ---------------------------------------------------------------------------
// DeepSeek — the page's own text when it has one, otherwise the uploaded PDF
// ---------------------------------------------------------------------------

type DeepSeekFileAnswer = { id?: string };
type DeepSeekChatAnswer = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export type DeepSeekReaderDeps = {
  /** Tests pass a fake; production uses the platform `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Tests pass a fake; production reads the page's text layer. A page it answers "" for is read as a picture
   * through the Files API, so a test with fake bytes keeps exercising that path.
   */
  readText?: (pdfBytes: Uint8Array) => Promise<string>;
  uploadTimeoutMs?: number;
  chatTimeoutMs?: number;
  deleteTimeoutMs?: number;
  /** Chat tries when the answer is not JSON. Two means "bad JSON twice", then the caller falls back to Gemini. */
  jsonTries?: number;
  /** Test seams for the shared guards / call log; production leaves both out. */
  guards?: () => Promise<void>;
  log?: (entry: ProviderCallEntry) => Promise<void>;
};

function answerJson(answer: DeepSeekChatAnswer): unknown {
  const text = answer.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new ManualReaderJsonError("The page reader answered with nothing.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ManualReaderJsonError("The page reader answered with something that is not JSON.");
  }
}

/** The rows a JSON answer carries, without the rest of the shape (used only to spot an empty answer). */
function answerRowCount(raw: unknown): number | null {
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === "object") {
    const rows = (raw as Record<string, unknown>).rows;
    if (Array.isArray(rows)) return rows.length;
    return null;
  }
  return null;
}

/**
 * Ask on the same uploaded page until it answers with JSON. Only a JSON problem is worth asking again; a failed
 * call or a timeout is not (the caller falls back to Gemini).
 */
async function askUntilJson(tries: number, ask: () => Promise<unknown>): Promise<unknown> {
  let lastJsonError: ManualReaderJsonError | null = null;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await ask();
    } catch (err) {
      if (!(err instanceof ManualReaderJsonError)) throw err;
      lastJsonError = err;
    }
  }
  throw lastJsonError ?? new ManualReaderJsonError("The page reader answered with nothing.");
}

async function uploadPagePdf(
  opts: {
    apiKey: string;
    pdfBytes: Uint8Array;
    pageNo: number;
    fetchImpl: typeof fetch;
    timeoutMs: number;
    guards?: () => Promise<void>;
    log?: (entry: ProviderCallEntry) => Promise<void>;
  },
): Promise<string> {
  const form = new FormData();
  // The docs require `purpose` before `file` in a document upload.
  form.append("purpose", DEEPSEEK_DOCUMENT_PURPOSE);
  // Belt and braces on the delete: if the worker dies mid-read, DeepSeek drops the file at its expiry.
  form.append("expires_after[anchor]", "created_at");
  form.append("expires_after[seconds]", String(DEEPSEEK_FILE_TTL_SECONDS));
  // A fresh ArrayBuffer-backed copy: BlobPart wants a plain view, not the shared (possibly pooled) page bytes.
  const fileBytes = new Uint8Array(opts.pdfBytes.length);
  fileBytes.set(opts.pdfBytes);
  form.append(
    "file",
    new Blob([fileBytes], { type: "application/pdf" }),
    `manual-page-${opts.pageNo}.pdf`,
  );

  const gate = timeoutSignal(opts.timeoutMs);
  try {
    const answer = await trackedProviderCall<DeepSeekFileAnswer>({
      provider: "deepseek",
      service: "file_parsing",
      route: MANUAL_READ_ROUTE,
      model: DEEPSEEK_VISION_MODEL,
      requests: 1,
      guards: opts.guards,
      log: opts.log,
      run: async () => {
        const res = await opts.fetchImpl(`${DEEPSEEK_API_BASE}/files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.apiKey}` },
          signal: gate.signal,
          body: form,
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`DeepSeek file upload HTTP ${res.status}: ${text.slice(0, 300)}`);
        }
        return await res.json() as DeepSeekFileAnswer;
      },
      extractUsage: () => ({ requests: 1 }),
    });

    const id = String(answer?.id ?? "").trim();
    if (!id) throw new Error("DeepSeek did not return a file id for the page.");
    return id;
  } finally {
    gate.done();
  }
}

/**
 * Delete the uploaded file. Best effort on purpose: a page that was read must not be lost (or billed twice)
 * because the delete answered slowly, and a file that outlives a failed delete disappears on its own when the
 * account's retention does. The key never reaches a log line.
 */
async function deleteUploadedFile(opts: {
  apiKey: string;
  fileId: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<void> {
  const gate = timeoutSignal(opts.timeoutMs);
  try {
    const res = await opts.fetchImpl(`${DEEPSEEK_API_BASE}/files/${encodeURIComponent(opts.fileId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      signal: gate.signal,
    });
    if (!res.ok) {
      console.warn(`[maintenance-manual-reader] DeepSeek file delete answered HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(
      `[maintenance-manual-reader] DeepSeek file delete failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    gate.done();
  }
}

/**
 * One DeepSeek chat call. The prompt is either the page's own text (see `maintenance_manual_text.ts`) or a
 * reference to the uploaded one-page PDF; everything else — JSON mode, thinking off, temperature 0 — is the same,
 * so a typed page and a scanned page are read by one model with one set of rules.
 */
async function chatAboutPage(opts: {
  apiKey: string;
  prompt: string;
  /** The uploaded page, when the page had no text layer. Omit to send the prompt as plain text. */
  fileId?: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  guards?: () => Promise<void>;
  log?: (entry: ProviderCallEntry) => Promise<void>;
}): Promise<unknown> {
  const gate = timeoutSignal(opts.timeoutMs);
  const content = opts.fileId
    ? [{ type: "text", text: opts.prompt }, { type: "file", file_id: opts.fileId }]
    : opts.prompt;
  try {
    const answer = await trackedProviderCall<DeepSeekChatAnswer>({
      provider: "deepseek",
      service: "vision",
      route: MANUAL_READ_ROUTE,
      model: DEEPSEEK_VISION_MODEL,
      guards: opts.guards,
      log: opts.log,
      run: async () => {
        const res = await opts.fetchImpl(`${DEEPSEEK_API_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
          },
          signal: gate.signal,
          body: JSON.stringify({
            model: DEEPSEEK_VISION_MODEL,
            messages: [{ role: "user", content }],
            // The strict JSON rows the worker parses; the prompt already carries the example and the word JSON.
            response_format: { type: "json_object" },
            // Reading a table needs no chain of thought, and off saves latency and output tokens.
            thinking: { type: "disabled" },
            // The same page must read the same way twice: a page was read as 8 rows once and 12 the next time
            // before this was pinned. Temperature only applies with thinking off.
            temperature: 0,
            max_tokens: 8000,
            stream: false,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 300)}`);
        }
        return await res.json() as DeepSeekChatAnswer;
      },
      extractUsage: (r) => ({
        inputTokens: r?.usage?.prompt_tokens,
        outputTokens: r?.usage?.completion_tokens,
      }),
    });

    return answerJson(answer);
  } finally {
    gate.done();
  }
}

/**
 * The DeepSeek page reader.
 *
 * A typed page is read from its own text: no upload, exact characters, and the same answer every time. A page
 * with no text layer (a scan) is uploaded once and read by file id, and the file is deleted in a `finally` so no
 * request leaks a file on the account — the same one-page PDF the Gemini reader sends.
 *
 * An empty answer on the text path is worth one more ask (the page demonstrably has rows); on the PDF path it is
 * left alone, because a page of a manual really can have no table.
 */
export function callDeepSeekManualPageReader(
  apiKey: string | undefined,
  deps: DeepSeekReaderDeps = {},
): SinglePageReader {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const readText = deps.readText ?? readPageText;
  const jsonTries = Number.isFinite(deps.jsonTries)
    ? Math.max(1, Math.min(3, Math.floor(deps.jsonTries as number)))
    : 2;
  const chatTimeoutMs = deps.chatTimeoutMs ?? DEEPSEEK_CHAT_TIMEOUT_MS;

  return async (input) => {
    const key = (apiKey ?? "").trim();
    if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");

    // A failure here is not a failed page: an unreadable text layer just means "send the page as a picture".
    const pageText = await readText(input.pdfBytes).catch(() => "");

    if (isTypedPageText(pageText)) {
      const prompt = appendManualPageText(input.prompt, pageText);
      return await askUntilJson(jsonTries, async () => {
        const raw = await chatAboutPage({
          apiKey: key,
          prompt,
          fetchImpl,
          timeoutMs: chatTimeoutMs,
          guards: deps.guards,
          log: deps.log,
        });
        // The page has rows in its text, so an answer with none is a bad read, not an empty page.
        if (answerRowCount(raw) === 0) {
          throw new ManualReaderJsonError("The page reader answered with no rows for a page that has them.");
        }
        return raw;
      });
    }

    const fileId = await uploadPagePdf({
      apiKey: key,
      pdfBytes: input.pdfBytes,
      pageNo: input.pageNo,
      fetchImpl,
      timeoutMs: deps.uploadTimeoutMs ?? DEEPSEEK_UPLOAD_TIMEOUT_MS,
      guards: deps.guards,
      log: deps.log,
    });

    try {
      return await askUntilJson(jsonTries, () =>
        chatAboutPage({
          apiKey: key,
          fileId,
          prompt: input.prompt,
          fetchImpl,
          timeoutMs: chatTimeoutMs,
          guards: deps.guards,
          log: deps.log,
        }));
    } finally {
      await deleteUploadedFile({
        apiKey: key,
        fileId,
        fetchImpl,
        timeoutMs: deps.deleteTimeoutMs ?? DEEPSEEK_DELETE_TIMEOUT_MS,
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Which reader runs, and the fallback
// ---------------------------------------------------------------------------

/**
 * The reader the worker calls. `choice` comes from the `manual_reader` setting:
 *   - "gemini": Gemini only.
 *   - "deepseek": DeepSeek. When it fails (error, timeout, or bad JSON twice) the SAME attempt reads the page
 *     with Gemini, and the result says which reader produced the rows.
 *
 * A budget/kill-switch pause on either provider is never swallowed: it is thrown as `ProviderBlockedError` so
 * the worker waits and the page keeps its attempt.
 */
export function createManualPageReader(opts: {
  choice: ManualReaderName;
  gemini: SinglePageReader;
  deepseek: SinglePageReader;
  /**
   * True when an answer found nothing on the page. DeepSeek sometimes answers "nothing here" for a page that
   * prints values (the Roomy oil and coolant pages, 27 Nov), so Gemini checks that page in the same attempt.
   * DeepSeek stays the reader: Gemini's answer is used only when it finds something.
   */
  answeredNothing?: (raw: unknown) => boolean;
}): ManualPageReader {
  return async (input): Promise<ManualPageRead> => {
    if (opts.choice === "gemini") {
      return { raw: await opts.gemini(input), reader: "gemini" };
    }

    try {
      const raw = await opts.deepseek(input);
      if (opts.answeredNothing?.(raw)) {
        try {
          const check = await opts.gemini(input);
          if (!opts.answeredNothing(check)) {
            console.warn(`[maintenance-manual-reader] DeepSeek found nothing on page ${input.pageNo}; Gemini's check did.`);
            return { raw: check, reader: "gemini" };
          }
        } catch (checkErr) {
          if (checkErr instanceof ProviderBlockedError) throw checkErr;
          // The check is extra: if Gemini cannot run, DeepSeek's empty answer stands.
        }
      }
      return { raw, reader: "deepseek" };
    } catch (err) {
      if (err instanceof ProviderBlockedError) throw err;
      const deep = err instanceof Error ? err.message : "DeepSeek could not read the page";
      console.warn(
        `[maintenance-manual-reader] DeepSeek did not read page ${input.pageNo}; Gemini reads it in this attempt: ${deep.slice(0, 200)}`,
      );
      try {
        return { raw: await opts.gemini(input), reader: "gemini" };
      } catch (geminiErr) {
        if (geminiErr instanceof ProviderBlockedError) throw geminiErr;
        const gemini = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        throw new Error(`${deep} Gemini then failed: ${gemini}`);
      }
    }
  };
}

/** True when a page answer carries no rows at all: every list in it (specs, rows, intervals…) is empty. */
export function pageAnswerIsEmpty(raw: unknown): boolean {
  if (Array.isArray(raw)) return raw.length === 0;
  if (!raw || typeof raw !== "object") return true;
  return !Object.values(raw as Record<string, unknown>).some((v) => Array.isArray(v) && v.length > 0);
}
