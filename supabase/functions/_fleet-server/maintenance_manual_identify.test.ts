/**
 * Step 6b — DOC-01: what document is this, and which years does it cover?
 *
 * The two real files are read here, not described:
 *   C:/Users/deeki/Downloads/maintenancelist_2106_roomy_passenger.pdf   (the June 2021 maintenance sheet, 5 pages)
 *   C:/Users/deeki/Downloads/roomy-2021.pdf                             (the 568-page owner's manual)
 *
 * What this test proves:
 *   - the sheet HAS a readable Japanese text layer (so identifying it from text is free and exact),
 *   - the owner's manual's useful pages do NOT (so those pages go to the model as pictures, and Roam must not
 *     pretend it read them),
 *   - a page cut out of the real file is the page we asked for,
 *   - and, from the answers those documents actually give, the form is filled in as the plan says: Toyota, Roomy,
 *     JP, the right document type, the printed-page offset, the page list, and the years a dated sheet covers.
 *
 * The model call itself is exercised against a fake `fetch` (no key and no spend here): what is asserted is the
 * request Roam sends and what it does with the answer, never a canned "model result" standing in for a real file.
 *
 * deno test --no-check --allow-read supabase/functions/_fleet-server/maintenance_manual_identify.test.ts
 */
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { DEEPSEEK_VISION_MODEL } from "./deepseek_models.ts";
import {
  buildIdentifyPrompt,
  callDeepSeekIdentify,
  chooseYears,
  DEEPSEEK_API_BASE,
  type CatalogueFamily,
  IDENTIFY_ROUTE,
  matchCatalogueFamily,
  parseIdentifyAnswer,
  offsetFromPageHeads,
  withCountedOffset,
  printedPageOrNull,
  toDate,
  toDocType,
  toMarket,
} from "./maintenance_manual_identify.ts";
import { countPdfPages, extractPdfPage } from "./maintenance_manual_pdf.ts";
import { isTypedPageText, readPageText } from "./maintenance_manual_text.ts";
import type { ProviderCallEntry } from "./api_usage_logger.ts";

const SHEET_PATH = "C:/Users/deeki/Downloads/maintenancelist_2106_roomy_passenger.pdf";
const OWNERS_PATH = "C:/Users/deeki/Downloads/roomy-2021.pdf";

async function readIfPresent(path: string): Promise<Uint8Array | null> {
  try {
    return await Deno.readFile(path);
  } catch {
    return null;
  }
}

const SHEET = await readIfPresent(SHEET_PATH);
const OWNERS = await readIfPresent(OWNERS_PATH);

// ---------------------------------------------------------------------------
// The real sheet
// ---------------------------------------------------------------------------

Deno.test({
  name: "the June 2021 sheet is 5 pages and its own text says Toyota Roomy, printed 2021年6月1日",
  ignore: SHEET == null,
  fn: async () => {
    const bytes = SHEET!;
    assertEquals(await countPdfPages(bytes), 5);

    const first = await extractPdfPage(bytes, 1);
    const firstText = await readPageText(first);
    if (!firstText.includes("ルーミー")) throw new Error(`the model name is not in the page text:\n${firstText}`);
    if (!firstText.includes("2021年6月1日")) throw new Error(`the printed date is not in the page text:\n${firstText}`);
    assertEquals(isTypedPageText(firstText), true);

    // Page 5 is the only page with the replacement table, which is why the reader suggests it.
    const fifth = await extractPdfPage(bytes, 5);
    const fifthText = await readPageText(fifth);
    if (!fifthText.includes("交換時期")) throw new Error(`page 5 has no replacement table:\n${fifthText}`);
    if (!fifthText.includes("単位：年")) throw new Error("page 5 lost its years unit");
    if (!fifthText.includes("交換:千ｋm")) throw new Error("page 5 lost its thousand-km unit");
  },
});

const SHEET_FIRST_TEXT = SHEET ? await readPageText(await extractPdfPage(SHEET, 1)) : "";
const SHEET_FIFTH_TEXT = SHEET ? await readPageText(await extractPdfPage(SHEET, 5)) : "";

/** The answer a correct read of the sheet gives (the document's own facts, not a canned model result). */
const SHEET_ANSWER = {
  make: "Toyota",
  model: "Roomy",
  printed_date: "2021-06-01",
  market: "JP",
  doc_type: "schedule",
  title: "Toyota Roomy maintenance sheet, June 2021",
  page_offset: 0,
  pages: [
    { pdf_page: 1, reason: "the header that dates the sheet and names the car" },
    { pdf_page: 5, reason: "the replacement table (交換時期)" },
  ],
  fields: {
    make: { sure: true, reason: "" },
    model: { sure: true, reason: "" },
    printed_date: { sure: true, reason: "printed in every page header" },
    market: { sure: true, reason: "Japanese sheet" },
    doc_type: { sure: true, reason: "a maintenance sheet, not an owner's manual" },
    title: { sure: true, reason: "" },
    page_offset: { sure: true, reason: "the sheet prints no page numbers" },
    pages: { sure: true, reason: "" },
  },
};

/** Roomy in the catalogue: a 2016–2020 run and a 2020-on run. */
const ROOMY_YEARS = [
  { from: 2016, to: 2020 },
  { from: 2020, to: null },
];

const ROOMY: CatalogueFamily = {
  platform_id: "6990b04f-0000-4000-8000-000000000001",
  name: "Toyota Roomy",
  make: "Toyota",
  model: "Roomy",
  years: ROOMY_YEARS,
};

Deno.test("the sheet's identify answer fills the form: Toyota, Roomy, JP, schedule, page 5, offset 0", () => {
  const answer = parseIdentifyAnswer(SHEET_ANSWER, 5);

  assertEquals(answer.make, "Toyota");
  assertEquals(answer.model, "Roomy");
  assertEquals(answer.printed_date, "2021-06-01");
  assertEquals(answer.market, "JP");
  assertEquals(answer.doc_type, "schedule");
  assertEquals(answer.page_offset, 0);
  assertEquals(answer.pages.map((p) => p.pdf_page), [1, 5]);
  // The sheet prints no page numbers, so printed page = PDF page.
  assertEquals(answer.pages.map((p) => p.printed_page), [1, 5]);
  // Nothing was unsure, so the screen shows no "check this" line.
  assertEquals(Object.values(answer.fields).filter((f) => !f.sure).length, 0);
});

Deno.test("a June 2021 sheet covers the 2020-on cars, never the 2016-2020 ones", () => {
  const years = chooseYears("2021-06-01", ROOMY.years);
  assertEquals(years.year_from, 2020);
  assertEquals(years.year_to, null);
  assertEquals(years.fromPrintedDate, false);

  // A 2019 document would cover the earlier run instead.
  const earlier = chooseYears("2019-03-01", ROOMY.years);
  assertEquals(earlier.year_from, 2016);
  assertEquals(earlier.year_to, 2020);
});

Deno.test("with no printed date the document covers the whole catalogue range, and says it came from there", () => {
  const years = chooseYears(null, ROOMY.years);
  assertEquals(years.year_from, 2016);
  assertEquals(years.year_to, null);
  assertEquals(years.fromPrintedDate, false);

  // No catalogue years at all: the printed year is all Roam has.
  const bare = chooseYears("2021-06-01", []);
  assertEquals(bare.year_from, 2021);
  assertEquals(bare.year_to, null);
  assertEquals(bare.fromPrintedDate, true);
});

Deno.test("the sheet's own text is what reaches the model, and the prompt asks for plain words", () => {
  const prompt = buildIdentifyPrompt({
    fileName: "maintenancelist_2106_roomy_passenger.pdf",
    pageCount: 5,
    pages: [
      { pdf_page: 1, text: SHEET_FIRST_TEXT },
      { pdf_page: 5, text: SHEET_FIFTH_TEXT },
    ],
  });

  if (!prompt.includes(SHEET_FIRST_TEXT.slice(0, 200))) throw new Error("the page text must be in the prompt");
  if (!prompt.includes("2021年6月1日")) throw new Error("the printed date must reach the model");
  if (!prompt.includes("printed = PDF page - page_offset")) throw new Error("the offset rule must be spelled out");
  if (!prompt.includes("JSON only")) throw new Error("the prompt must ask for JSON only");
  if (!prompt.includes("never codes")) throw new Error("titles are plain words, never codes");
});

// ---------------------------------------------------------------------------
// The real owner's manual
// ---------------------------------------------------------------------------

Deno.test({
  name: "the owner's manual is 568 pages and its useful pages are pictures, not a text layer",
  ignore: OWNERS == null,
  fn: async () => {
    const bytes = OWNERS!;
    assertEquals(await countPdfPages(bytes), 568);

    // The specifications pages carry no text at all: the reader must send the page itself, not an empty string.
    for (const pageNo of [524, 525, 530]) {
      const text = await readPageText(await extractPdfPage(bytes, pageNo));
      assertEquals(isTypedPageText(text), false, `page ${pageNo} must not look typed`);
    }

    // Page 407 does carry some printable text, so the cut page is really page 407 and not another one.
    const fourOhSeven = await readPageText(await extractPdfPage(bytes, 407));
    if (!fourOhSeven.includes("ABTH720201")) {
      throw new Error(`page 407 was not the page we cut: ${fourOhSeven.slice(0, 120)}`);
    }
  },
});

/** The useful pages of this book, in PDF numbering (docs/manual-data-value-review.md D). */
const OWNERS_PAGES = [3, 406, 407, 408, 409, 410, 411, 416, 417, 524, 525, 526, 527, 528, 529, 530];

const OWNERS_ANSWER = {
  make: "Toyota",
  model: "Roomy",
  printed_date: null,
  market: "JP",
  doc_type: "owners_manual",
  title: "Toyota Roomy owner's manual",
  page_offset: 4,
  pages: OWNERS_PAGES.map((pdfPage) => ({ pdf_page: pdfPage, reason: "specifications" })),
  fields: {
    make: { sure: true, reason: "" },
    model: { sure: true, reason: "" },
    printed_date: { sure: false, reason: "the book prints an edition, not a date" },
    market: { sure: true, reason: "Japanese edition" },
    doc_type: { sure: true, reason: "the maker's owner's manual" },
    title: { sure: true, reason: "" },
    page_offset: { sure: true, reason: "PDF 409 is printed 405" },
    pages: { sure: true, reason: "" },
  },
};

Deno.test("the owner's manual fills the form: owner's manual, offset 4, 16 pages to read, not 568", () => {
  const answer = parseIdentifyAnswer(OWNERS_ANSWER, 568);

  assertEquals(answer.doc_type, "owners_manual");
  assertEquals(answer.page_offset, 4);
  assertEquals(answer.pages.length, 16);
  assertEquals(answer.pages.map((p) => p.pdf_page), OWNERS_PAGES);

  // Printed page = PDF - 4. Front matter has no printed number, so it is null, never -1.
  assertEquals(answer.pages[0].printed_page, null);
  assertEquals(printedPageOrNull(406, 4), 402);
  assertEquals(printedPageOrNull(530, 4), 526);
  assertEquals(answer.pages.find((p) => p.pdf_page === 406)?.printed_page, 402);
  assertEquals(answer.pages.find((p) => p.pdf_page === 530)?.printed_page, 526);

  // The one field the book cannot answer is marked unsure, with a reason a person can read.
  assertEquals(answer.fields.printed_date.sure, false);
  if (!answer.fields.printed_date.reason) throw new Error("an unsure field must say why");
});

Deno.test("pages outside the PDF are dropped, and a repeated page is kept once", () => {
  const answer = parseIdentifyAnswer(
    { ...SHEET_ANSWER, pages: [{ pdf_page: 2 }, { pdf_page: 2 }, { pdf_page: 900 }, { pdf_page: 0 }] },
    5,
  );
  assertEquals(answer.pages.map((p) => p.pdf_page), [2]);
});

// ---------------------------------------------------------------------------
// Which family
// ---------------------------------------------------------------------------

Deno.test("the make and model pick the catalogue family", () => {
  const families: CatalogueFamily[] = [
    ROOMY,
    { platform_id: "p2", name: "Toyota Tank", make: "Toyota", model: "Tank", years: [{ from: 2016, to: 2020 }] },
    { platform_id: "p3", name: "Daihatsu Thor", make: "Daihatsu", model: "Thor", years: [{ from: 2016, to: 2020 }] },
  ];

  const match = matchCatalogueFamily(families, "Toyota", "Roomy");
  assertEquals(match.family?.platform_id, ROOMY.platform_id);
  assertEquals(match.closeNames, []);

  // The document says "Roomy (Japan)"; the catalogue says "Roomy".
  assertEquals(matchCatalogueFamily(families, "toyota", "Roomy (Japan)").family?.platform_id, ROOMY.platform_id);
  // A different maker with the same model word is not a match.
  assertEquals(matchCatalogueFamily(families, "Daihatsu", "Roomy").family, null);
});

Deno.test("a family shared by several makers is found from any of its cars (M900: Roomy, Tank, Thor, Justy)", () => {
  const m900: CatalogueFamily = {
    platform_id: "m900",
    name: "Toyota Roomy",
    make: "Toyota",
    model: "Roomy",
    years: [{ from: 2016, to: 2020 }],
    cars: [
      { make: "Toyota", model: "Roomy" },
      { make: "Toyota", model: "Tank" },
      { make: "Daihatsu", model: "Thor" },
      { make: "Subaru", model: "Justy" },
    ],
  };
  // The live bug: the platform row's maker is the word "family", which once hid every family from the match.
  const live = { ...m900, make: "family" };
  assertEquals(matchCatalogueFamily([live], "Toyota", "Roomy").family?.platform_id, "m900");
  assertEquals(matchCatalogueFamily([m900], "Daihatsu", "Thor").family?.platform_id, "m900");
  assertEquals(matchCatalogueFamily([m900], "Honda", "Fit").family, null);
});

Deno.test("a run of pages comes back as every page in it, and the page headers reach the prompt", () => {
  const answer = parseIdentifyAnswer(
    { doc_type: "owners_manual", page_offset: 4, pages: [{ pdf_page: 3 }, { from: 524, to: 530, reason: "Specifications" }, { from: 600, to: 610 }] },
    568,
  );
  assertEquals(answer.pages.map((p) => p.pdf_page), [3, 524, 525, 526, 527, 528, 529, 530]);
  assertEquals(answer.pages[1].printed_page, 520);

  const prompt = buildIdentifyPrompt({
    fileName: "roomy.pdf",
    pageCount: 568,
    pages: [{ pdf_page: 1, text: "トヨタ ルーミー 取扱書" }],
    pageHeads: [{ pdf_page: 524, text: "520 8-1. 仕様一覧 メンテナンスデータ" }],
  });
  assertEquals(prompt.includes("524: 520 8-1. 仕様一覧"), true);
});

Deno.test("two families that fit equally well are a question, not a guess", () => {
  const families: CatalogueFamily[] = [
    { platform_id: "a", name: "Toyota Roomy", make: "Toyota", model: "Roomy", years: [] },
    { platform_id: "b", name: "Toyota Roomy Japan", make: "Toyota", model: "Roomy", years: [] },
  ];
  const match = matchCatalogueFamily(families, "Toyota", "Roomy");
  assertEquals(match.family, null);
  assertEquals(match.closeNames.length, 2);
  // The form shows both as choices (Roomy 2WD M900 and 4WD M910 is the live case).
  assertEquals(match.closeFamilies.map((f) => f.platform_id).sort(), ["a", "b"]);
});

// ---------------------------------------------------------------------------
// What the model is asked, and what it is given
// ---------------------------------------------------------------------------

function fakeFetch(handler: (body: Record<string, unknown>) => Response) {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(input), body, headers: new Headers(init?.headers ?? {}) });
    return handler(body);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

Deno.test("a typed document is sent as text, in JSON mode, and its tokens are logged", async () => {
  const logged: ProviderCallEntry[] = [];
  const { fetchImpl, calls } = fakeFetch(() =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(SHEET_ANSWER) } }],
        usage: { prompt_tokens: 1500, completion_tokens: 180 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  );

  const reader = callDeepSeekIdentify("sk-test", {
    fetchImpl,
    guards: () => Promise.resolve(),
    log: (entry) => {
      logged.push(entry);
      return Promise.resolve();
    },
  });

  const raw = await reader({
    fileName: "maintenancelist_2106_roomy_passenger.pdf",
    pageCount: 5,
    pages: [{ pdf_page: 1, text: SHEET_FIRST_TEXT }],
  });

  assertEquals(parseIdentifyAnswer(raw, 5).model, "Roomy");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, `${DEEPSEEK_API_BASE}/chat/completions`);
  assertEquals(calls[0].headers.get("authorization"), "Bearer sk-test");
  assertEquals(calls[0].body.model, DEEPSEEK_VISION_MODEL);
  assertEquals(calls[0].body.response_format, { type: "json_object" });
  assertEquals(calls[0].body.temperature, 0);
  assertEquals(calls[0].body.thinking, { type: "disabled" });
  if (typeof calls[0].body.messages !== "object") throw new Error("messages must be sent");

  assertEquals(logged.length, 1);
  assertEquals(logged[0].provider, "deepseek");
  assertEquals(logged[0].route, IDENTIFY_ROUTE);
  assertEquals(logged[0].inputTokens, 1500);
  assertEquals(logged[0].outputTokens, 180);
});

Deno.test("a scanned document is sent as its page pictures, and no page text", async () => {
  const { fetchImpl, calls } = fakeFetch(() =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(OWNERS_ANSWER) } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  );

  await callDeepSeekIdentify("sk-test", { fetchImpl, guards: () => Promise.resolve() })({
    fileName: "roomy-2021.pdf",
    pageCount: 568,
    pages: [],
    pageImages: ["AAAA", "BBBB"],
    imagesMimeType: "image/jpeg",
  });

  const content = (calls[0].body.messages as Array<{ content: unknown }>)[0].content;
  if (!Array.isArray(content)) throw new Error("an image request must carry an array of parts");
  assertEquals(content.length, 3); // the prompt and two pictures
  const images = content.filter((part) => (part as { type?: string }).type === "image_url");
  assertEquals(images.length, 2);
  const url = (images[0] as { image_url: { url: string } }).image_url.url;
  if (!url.startsWith("data:image/jpeg;base64,AAAA")) throw new Error(`the picture must be inline: ${url.slice(0, 40)}`);
});

Deno.test("no key: the reader refuses instead of sending a request", async () => {
  const { fetchImpl, calls } = fakeFetch(() => new Response("{}", { status: 200 }));
  await assertRejects(() =>
    callDeepSeekIdentify("", { fetchImpl, guards: () => Promise.resolve() })({
      fileName: "x.pdf",
      pageCount: 5,
      pages: [{ pdf_page: 1, text: "hello" }],
    })
  );
  assertEquals(calls.length, 0);
});

// ---------------------------------------------------------------------------
// The small normalisers
// ---------------------------------------------------------------------------

Deno.test("a date, a market and a document type are read the way people write them", () => {
  assertEquals(toDate("2021-06-01"), "2021-06-01");
  assertEquals(toDate("2021/6/1"), "2021-06-01");
  assertEquals(toDate("2021年6月1日"), "2021-06-01");
  assertEquals(toDate("1 June 2021"), "2021-06-01");
  assertEquals(toDate("June 2021"), null);
  assertEquals(toDate("2021-13-01"), null);
  assertEquals(toDate(""), null);

  assertEquals(toMarket("Japan"), "JP");
  assertEquals(toMarket("JP"), "JP");
  assertEquals(toMarket("Jamaica"), "JM");
  assertEquals(toMarket("export"), "GEN");
  assertEquals(toMarket(""), null);

  assertEquals(toDocType("owner's manual"), "owners_manual");
  assertEquals(toDocType("Owners Manual"), "owners_manual");
  assertEquals(toDocType("maintenance sheet"), "schedule");
  assertEquals(toDocType("点検整備方式"), "schedule");
  assertEquals(toDocType("invoice"), null);
});

Deno.test("a document the reader cannot place on the form still gets a title and a schedule type", () => {
  const answer = parseIdentifyAnswer({}, 10);
  assertEquals(answer.doc_type, "schedule");
  assertEquals(answer.title, "Car document");
  assertEquals(answer.page_offset, 0);
  assertEquals(answer.pages, []);
  assertEquals(answer.fields.make.sure, false);
  // A nonsense offset is not carried into the form.
  assertEquals(parseIdentifyAnswer({ page_offset: 999 }, 10).page_offset, 0);
});


Deno.test("the page offset is counted from the numbers printed in the book, not taken from the reader's guess", () => {
  // The Roomy owner's manual: PDF 400 starts "396 6-1. …", PDF 523 ends its line with the chapter number.
  const heads = Array.from({ length: 120 }, (_, i) => ({ pdf_page: 400 + i, text: `${396 + i} 6-1. お手入れのしかた` }));
  heads.push({ pdf_page: 3, text: "ご愛車に関するメモ 記入される記号" });
  assertEquals(offsetFromPageHeads(heads), 4);

  // The reader said 2 on one run: Roam keeps the counted 4 and redoes the printed numbers.
  const answer = parseIdentifyAnswer({ doc_type: "owners_manual", page_offset: 2, pages: [{ from: 524, to: 525 }] }, 568);
  const fixed = withCountedOffset(answer, heads);
  assertEquals(fixed.page_offset, 4);
  assertEquals(fixed.pages.map((p) => p.printed_page), [520, 521]);

  // A sheet with no printed numbers: the reader's answer stands.
  assertEquals(offsetFromPageHeads([{ pdf_page: 1, text: "メンテナンスリスト" }]), null);
});
