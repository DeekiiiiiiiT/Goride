/**
 * R2 (docs/saved-page-parts-audit.md §4): page → numbered lines. Made-up pages only — invented numbers, no real site.
 * deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/saved_page_text.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fileKindInfo,
  formatBytes,
  humanFileKind,
  isWebPage,
  MAX_LINES,
  savedPageText,
} from "./saved_page_text.ts";

const enc = (s: string) => new TextEncoder().encode(s);

/** Invented table layout: a group row, then one row per number with notes, a frame split, dates and a price. */
const TABLE_HTML = `<!doctype html>
<html><head><title>Check Catalogue ZZ900-AAAA 11.2016 - 09.2020</title>
<style>.x { color: red }</style>
<script>var decoy = "99999-99999";</script>
</head>
<body>
<!-- saved from url=(0124)https://catalog.example/parts?search=11111-A1001 -->
<h2>Front shock absorber</h2>
<table>
<tr><th>Number</th><th>Notes</th><th>From</th><th>To</th><th>Price</th></tr>
<tr><td>GROUP 77777U - ABSORBER SET, SHOCK, FRONT RH</td></tr>
<tr><td><a title="Front right shock">11111-A1001</a></td><td>ZZ900..NTBO<br>from frame 0255546</td><td>11.2016</td><td>11.2018</td><td>21.56</td></tr>
<tr><td>11111-B1002</td><td><span>frame 0255547</span></td><td>11.2018</td><td>09.2020</td><td>22.10</td></tr>
<tr><td>22222-A1001</td><td>マーク ４８５１０−Ｂ１３４０</td><td>11.2016</td><td>09.2020</td><td>4.63</td></tr>
</table>
<svg><text>SVG-DECOY</text></svg>
<noscript>NOSCRIPT-DECOY</noscript>
<p>A&amp;B &lt;x&gt; &#65;</p>
</body></html>`;

/** Invented list layout: a flat list — each group item and each number is its own item (SP-41). */
const LIST_HTML = `<html><head><title>List ZZ900-AAAA 11.2016 - 09.2020</title></head><body>
<ul>
  <li>Front Right</li>
  <li>11111-A1001 11.2016 - 11.2018</li>
  <li>11111-B1002 11.2018 - 09.2020</li>
  <li>Front Left</li>
  <li>22222-A1001 11.2016 - 11.2018</li>
  <li>22222-B1002 11.2018 - 09.2020</li>
</ul>
</body></html>`;

/** Invented nested list with ONE item: it is a layout list and stays on the outer item's line (SP-41). */
const NESTED_LIST_HTML = `<html><body>
<ul>
  <li>Front Right
    <ul>
      <li>11111-A1001 11.2016 - 11.2018</li>
    </ul>
  </li>
</ul>
</body></html>`;

/** Invented nested list with TWO items: each item is its own line and the outer item's text is its own line (SP-47). */
const NESTED_LIST_SPLIT_HTML = `<html><body>
<ul>
  <li>Front Right
    <ul>
      <li>11111-A1001 11.2016 - 11.2018</li>
      <li>11111-B1002 11.2018 - 09.2020</li>
    </ul>
  </li>
</ul>
</body></html>`;

/** Invented nested table: the ONE-row "To / frame no. / code" cell table stays on the row (SP-41, SP-47). */
const NESTED_TABLE_HTML = `<html><body>
<table>
<tr><td>GROUP 77777U - ABSORBER SET, SHOCK, FRONT RH</td></tr>
<tr>
  <td><a title="Front right shock">11111-A1001</a></td>
  <td><table><tr><td>To</td><td>0255546</td><td>ZZ900</td></tr></table></td>
  <td>11.2016</td><td>11.2018</td><td>21.56</td>
</tr>
<tr>
  <td>11111-B1002</td>
  <td><table><tr><td>From</td><td>0255547</td><td>ZZ900</td></tr></table></td>
  <td>11.2018</td><td>09.2020</td><td>22.10</td>
</tr>
</table>
</body></html>`;

/**
 * Invented copy of the owner's nesting (SP-47): the outer table's row holds a group table with THREE rows (group
 * name + two part rows); each part row's description cell holds a ONE-row "To / frame no. / code" table.
 */
const GROUP_TABLE_IN_ROW_HTML = `<html><body>
<table>
<tr><td>
  <table>
    <tr><td>GROUP 77777U - ABSORBER SET, SHOCK, FRONT RH</td></tr>
    <tr>
      <td>11111-A1001</td>
      <td><table><tr><td>To</td><td>0255546</td><td>ZZ900</td></tr></table></td>
      <td>11.2016 - 11.2018</td><td>01</td><td>21.56</td>
    </tr>
    <tr>
      <td>11111-B1002</td>
      <td><table><tr><td>From</td><td>0255547</td><td>ZZ900</td></tr></table></td>
      <td>11.2018 - 09.2020</td><td>01</td><td>22.10</td>
    </tr>
  </table>
</td></tr>
<tr><td>
  <table>
    <tr><td>GROUP 77778U - ABSORBER SET, SHOCK, FRONT LH</td></tr>
    <tr>
      <td>22222-A1001</td>
      <td><table><tr><td>To</td><td>0255548</td><td>ZZ900</td></tr></table></td>
      <td>11.2016 - 11.2018</td><td>01</td><td>4.63</td>
    </tr>
    <tr>
      <td>22222-B1002</td>
      <td><table><tr><td>From</td><td>0255549</td><td>ZZ900</td></tr></table></td>
      <td>11.2018 - 09.2020</td><td>01</td><td>4.63</td>
    </tr>
  </table>
</td></tr>
</table>
</body></html>`;

Deno.test("R2 table layout: one line per row, cells joined, inner blocks never split the row", () => {
  const page = savedPageText(enc(TABLE_HTML), "page.html");
  assertEquals(page.kind, "html");
  assertEquals(page.url, "https://catalog.example/parts?search=11111-A1001");
  assertEquals(page.title, "Check Catalogue ZZ900-AAAA 11.2016 - 09.2020");
  const group = page.lines.findIndex((l) => l.includes("GROUP 77777U"));
  const right = page.lines.findIndex((l) => l.includes("11111-A1001"));
  const later = page.lines.findIndex((l) => l.includes("11111-B1002"));
  assert(group >= 0 && right > group && later > right, page.lines.join("\n"));
  // The number row is one line: link title, number and every cell joined with " | ".
  assertEquals(page.lines[right], "Front right shock 11111-A1001 | ZZ900..NTBO from frame 0255546 | 11.2016 | 11.2018");
  assert(page.lines[later].startsWith("11111-B1002 | frame 0255547 | 11.2018 | 09.2020"), page.lines[later]);
  // Same table for the group row and its numbers; headings are not in it.
  assertEquals(page.containers[group], page.containers[right]);
  const heading = page.lines.findIndex((l) => l === "Front shock absorber");
  assert(heading >= 0 && page.containers[heading] !== page.containers[right]);
});

Deno.test("R2 table layout: prices are removed from every line (SP-59)", () => {
  const page = savedPageText(enc(TABLE_HTML), "page.html");
  const text = page.lines.join("\n");
  assert(!text.includes("21.56") && !text.includes("22.10") && !text.includes("4.63"), text);
});

Deno.test("R2: full-width characters are kept as written (SP-17)", () => {
  const page = savedPageText(enc(TABLE_HTML), "page.html");
  const line = page.lines.find((l) => l.includes("マーク"));
  assert(line?.includes("マーク ４８５１０−Ｂ１３４０"), line);
  assert(!line!.includes("48510"), "full-width characters were folded");
});

Deno.test("R2: script, style, svg, noscript and comments never reach a line", () => {
  const page = savedPageText(enc(TABLE_HTML), "page.html");
  const text = page.lines.join("\n");
  for (const decoy of ["99999-99999", "color: red", "SVG-DECOY", "NOSCRIPT-DECOY", "saved from url"]) {
    assert(!text.includes(decoy), `${decoy} leaked: ${text}`);
  }
});

Deno.test("R2: entities are decoded", () => {
  const page = savedPageText(enc(TABLE_HTML), "page.html");
  assert(page.lines.includes("A&B <x> A"), page.lines.join("\n"));
});

Deno.test("R2 list layout: each item is its own line, in the same list", () => {
  const page = savedPageText(enc(LIST_HTML), "page.html");
  assertEquals(page.lines, [
    "List ZZ900-AAAA 11.2016 - 09.2020",
    "Front Right",
    "11111-A1001 11.2016 - 11.2018",
    "11111-B1002 11.2018 - 09.2020",
    "Front Left",
    "22222-A1001 11.2016 - 11.2018",
    "22222-B1002 11.2018 - 09.2020",
  ]);
  // The group item and its numbers belong to the same list (SP-16).
  assertEquals(page.containers[1], page.containers[2]);
  assertEquals(page.containers[4], page.containers[5]);
  assertEquals(page.containers[1], page.containers[4]);
});

Deno.test("SP-41: a list nested in an item stays on that item's one line", () => {
  const page = savedPageText(enc(NESTED_LIST_HTML), "page.html");
  assertEquals(page.lines, ["Front Right 11111-A1001 11.2016 - 11.2018"]);
});

Deno.test("SP-47: a nested list with two items splits into one line per item", () => {
  const page = savedPageText(enc(NESTED_LIST_SPLIT_HTML), "page.html");
  assertEquals(page.lines, [
    "Front Right",
    "11111-A1001 11.2016 - 11.2018",
    "11111-B1002 11.2018 - 09.2020",
  ]);
  assertEquals(page.containers[0], page.containers[1]);
  assertEquals(page.containers[1], page.containers[2]);
});

Deno.test("SP-41: a table nested in a row's cell stays on that row's one line", () => {
  const page = savedPageText(enc(NESTED_TABLE_HTML), "page.html");
  const a = page.lines.find((l) => l.includes("11111-A1001"));
  const b = page.lines.find((l) => l.includes("11111-B1002"));
  assert(a?.includes("To 0255546 ZZ900") && a.includes("11.2016") && a.includes("11.2018"), a);
  assert(b?.includes("From 0255547 ZZ900") && b.includes("11.2018") && b.includes("09.2020"), b);
  // The layout table makes no lines of its own.
  assertEquals(page.lines.filter((l) => l === "To" || l === "From" || l === "0255546" || l === "0255547").length, 0);
  assertEquals(page.lines.length, 3); // group row + the 2 number rows
});

Deno.test("SP-47: a group table inside an outer row makes each of its rows its own line", () => {
  const page = savedPageText(enc(GROUP_TABLE_IN_ROW_HTML), "page.html");
  assertEquals(page.lines.length, 6); // 2 group names + 4 part rows
  const line = (number: string) => page.lines.find((l) => l.includes(number)) ?? "";
  // Each part row has its own single date range, never the other half's.
  assert(line("11111-A1001").includes("11.2016 - 11.2018") && !line("11111-A1001").includes("09.2020"), line("11111-A1001"));
  assert(line("11111-B1002").includes("11.2018 - 09.2020") && !line("11111-B1002").includes("11.2016"), line("11111-B1002"));
  assert(line("22222-A1001").includes("11.2016 - 11.2018") && !line("22222-A1001").includes("09.2020"), line("22222-A1001"));
  assert(line("22222-B1002").includes("11.2018 - 09.2020") && !line("22222-B1002").includes("11.2016"), line("22222-B1002"));
  // The group-name rows are their own lines and hold no number.
  const group1 = page.lines.find((l) => l.includes("GROUP 77777U")) ?? "";
  const group2 = page.lines.find((l) => l.includes("GROUP 77778U")) ?? "";
  assert(group1 && !/\d{5}-[A-Z]\d{4}/.test(group1), group1);
  assert(group2 && !/\d{5}-[A-Z]\d{4}/.test(group2), group2);
  // A group table is its own table: the group line and its two part lines share one container.
  const i1 = page.lines.findIndex((l) => l.includes("GROUP 77777U"));
  const p1 = page.lines.findIndex((l) => l.includes("11111-A1001"));
  const p2 = page.lines.findIndex((l) => l.includes("11111-B1002"));
  const g2 = page.lines.findIndex((l) => l.includes("GROUP 77778U"));
  assertEquals(page.containers[i1], page.containers[p1]);
  assertEquals(page.containers[p1], page.containers[p2]);
  assert(page.containers[i1] !== page.containers[g2]);
  // The one-row frame tables stay on their part row.
  assert(line("11111-A1001").includes("To 0255546 ZZ900"), line("11111-A1001"));
  assert(line("22222-B1002").includes("From 0255549 ZZ900"), line("22222-B1002"));
});

Deno.test("R2: the page caps at 3,000 lines and says it was cut", () => {
  const many = `<html><body>${Array.from({ length: MAX_LINES + 5 }, (_, i) => `<p>line ${i + 1}</p>`).join("")}</body></html>`;
  const page = savedPageText(enc(many), "many.html");
  assertEquals(page.lines.length, MAX_LINES);
  assertEquals(page.truncated, true);
});

// ---------------------------------------------------------------- .mhtml

const MHTML_QP = [
  "MIME-Version: 1.0",
  'Content-Type: multipart/related; boundary="----=_NextPart_01"',
  "",
  "------=_NextPart_01",
  "Content-Location: https://catalog.example/parts/ZZ900",
  'Content-Type: text/html; charset="utf-8"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "<html><head><title>Saved ZZ900-AAAA</title></head><body>",
  "<table><tr><td>=E3=83=9E=E3=83=BC=E3=82=AF</td><td>11111-A1001</td></tr></table>",
  "</body></html>",
  "------=_NextPart_01--",
].join("\r\n");

Deno.test("R2 .mhtml: unpacks the quoted-printable html part and keeps its link", () => {
  const page = savedPageText(enc(MHTML_QP), "page.mhtml");
  assertEquals(page.kind, "mhtml");
  assertEquals(page.url, "https://catalog.example/parts/ZZ900");
  assertEquals(page.title, "Saved ZZ900-AAAA");
  assert(page.lines.includes("マーク | 11111-A1001"), page.lines.join("\n"));
});

Deno.test("R2 .mhtml: base64 parts and their character set are decoded", () => {
  const html = `<html><body><table><tr><td>caf\u00e9 &amp; parts</td><td>11111-A1001</td></tr></table></body></html>`;
  // windows-1252 body, base64 (0xE9 is é).
  const bytes = new Uint8Array([...html].map((c) => c.charCodeAt(0)));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const body = btoa(bin);
  const mhtml = [
    "MIME-Version: 1.0",
    'Content-Type: multipart/related; boundary="b1"',
    "",
    "--b1",
    "Content-Location: https://catalog.example/parts/ZZ901",
    'Content-Type: text/html; charset="windows-1252"',
    "Content-Transfer-Encoding: base64",
    "",
    body,
    "--b1--",
  ].join("\r\n");
  const page = savedPageText(enc(mhtml), "page.mhtml");
  assertEquals(page.url, "https://catalog.example/parts/ZZ901");
  assertEquals(page.lines, ["café & parts | 11111-A1001"]);
});

// ---------------------------------------------------------------- file checks

Deno.test("R1: a PDF, PNG or plain text file is not a web page, and the kind is named", () => {
  assertEquals(fileKindInfo(enc("%PDF-1.7\n..."), "page.pdf"), "pdf");
  assertEquals(fileKindInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), "page.png"), "png");
  assertEquals(fileKindInfo(enc("hello"), "notes.txt"), "unknown");
  assertEquals(isWebPage(enc("%PDF-1.7"), "page.html"), { ok: false, kind: "pdf" });
  // The name decides what the owner picked: a .pdf that happens to hold HTML is still a PDF file to the owner.
  assertEquals(isWebPage(enc("<html><body>x</body></html>"), "page.pdf"), { ok: false, kind: "pdf" });
  assertEquals(isWebPage(enc("<html><body>x</body></html>"), "page.html"), { ok: true, kind: "html" });
  assertEquals(humanFileKind("pdf"), "PDF");
  assertEquals(formatBytes(6.2 * 1024 * 1024), "6.2 MB");
});

Deno.test("R1: a real saved-from-url comment inside .html is the link", () => {
  const page = savedPageText(enc(`<!-- saved from url=(0043)https://catalog.example/x --><html><body><p>hi</p></body></html>`), "page.html");
  assertEquals(page.url, "https://catalog.example/x");
});

/** Invented table inside a list item: the item is one line (SP-41). */
const TABLE_IN_ITEM_HTML = `<html><body>
<ul>
  <li>Front Right
    <table><tr><td>To / frame no.</td><td>0255546</td></tr></table>
    11.2016 - 11.2018
  </li>
</ul>
</body></html>`;

Deno.test("SP-41: a table nested in a list item stays on that item's one line", () => {
  const page = savedPageText(enc(TABLE_IN_ITEM_HTML), "page.html");
  assertEquals(page.lines, ["Front Right To / frame no. 0255546 11.2016 - 11.2018"]);
});