/**
 * R2 (docs/saved-page-parts-audit.md §4): a page the owner saved (Webpage .html or Webpage Single File .mhtml) becomes
 * numbered plain-text lines. One line per table row or list item; blocks inside a row never split it; cells join with
 * " | ". No DOM library, nothing from the page ever runs. Characters are kept as written and prices are removed.
 */
import { withoutPrices } from "./research_browser_check.ts";

export const MAX_LINES = 3000;
export const MAX_TEXT_BYTES = 200 * 1024;

export type SavedPageText = {
  kind: "html" | "mhtml";
  title: string;
  /** The link the saved file itself carries ("saved from url" comment, or Snapshot-/Content-Location), else null. */
  url: string | null;
  lines: string[];
  /** Table/list number per line: a group row counts only in the same one as its number row (SP-16). */
  containers: number[];
  truncated: boolean;
};

export type FileKind = "html" | "mhtml" | "pdf" | "png" | "jpeg" | "gif" | "zip" | "rtf" | "gzip" | "text" | "unknown";

const WEB_EXT = new Set(["html", "htm", "mhtml", "mht"]);

const latin1 = (bytes: Uint8Array, n: number) => {
  let s = "";
  for (let i = 0; i < Math.min(bytes.length, n); i++) s += String.fromCharCode(bytes[i]);
  return s;
};

function extensionOf(fileName: string): string {
  const m = String(fileName ?? "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** What a saved file is, from its first bytes (a small library of magic numbers) and its name (SP-18 / R1). */
export function fileKindInfo(bytes: Uint8Array, fileName: string): FileKind {
  const head = latin1(bytes, 8);
  if (head.startsWith("%PDF")) return "pdf";
  if (head.startsWith("\x89PNG")) return "png";
  if (head.startsWith("\xFF\xD8\xFF")) return "jpeg";
  if (head.startsWith("GIF8")) return "gif";
  if (head.startsWith("PK\x03\x04")) return "zip";
  if (head.startsWith("{\\rtf")) return "rtf";
  if (head.startsWith("\x1F\x8B")) return "gzip";
  const text = latin1(bytes, 4096).replace(/^\uFEFF/, "").replace(/^\s+/, "").toLowerCase();
  // Packed pages first: their body also contains <html>, but the package headers decide what they are (SP-18).
  if (/^mime-version\s*:/i.test(text) || /^from\s*:/.test(text) || /content-type\s*:\s*multipart\/related/i.test(text)) return "mhtml";
  if (/^<(!doctype\s+html|html|head|body|meta|!--\s*saved\s+from\s+url)/.test(text) || /<html[\s>]/.test(text)) return "html";
  if (text.length > 0) {
    const ext = extensionOf(fileName);
    if (WEB_EXT.has(ext)) return /^</.test(text) ? "html" : "text";
    return "unknown";
  }
  return "unknown";
}

/** True when the file can be read as a saved web page: a web-page name and a web-page body (R1 `not_web_page`). */
export function isWebPage(bytes: Uint8Array, fileName: string): { ok: true; kind: "html" | "mhtml" } | { ok: false; kind: FileKind } {
  const ext = extensionOf(fileName);
  const kind = fileKindInfo(bytes, fileName);
  const byName: Record<string, FileKind> = {
    pdf: "pdf", png: "png", jpg: "jpeg", jpeg: "jpeg", gif: "gif", zip: "zip", rtf: "rtf", gz: "gzip", txt: "text",
  };
  if (kind === "html" || kind === "mhtml") {
    // Both the name and the body must be a web page: a .pdf that holds HTML is a PDF file.
    if (WEB_EXT.has(ext)) return { ok: true, kind };
    return { ok: false, kind: byName[ext] ?? "unknown" };
  }
  if (WEB_EXT.has(ext)) return { ok: false, kind: kind === "unknown" ? "text" : kind };
  return { ok: false, kind: byName[ext] ?? kind };
}

/** Plain words for the stop card: "This file is a PDF" (SP-38). */
export function humanFileKind(kind: FileKind): string {
  const names: Record<FileKind, string> = {
    html: "web page", mhtml: "saved web page", pdf: "PDF", png: "PNG image", jpeg: "JPEG image", gif: "GIF image",
    zip: "ZIP file", rtf: "RTF document", gzip: "GZIP file", text: "text file", unknown: "file",
  };
  return names[kind] ?? "file";
}

/** "6.2 MB" for the stop card's detail box. */
export function formatBytes(n: number): string {
  const bytes = Math.max(0, Number(n) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------- entities

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", times: "×", divide: "÷", deg: "°", plusmn: "±", frac12: "½",
  frac14: "¼", frac34: "¾", sect: "§", para: "¶", middot: "·", bull: "•", laquo: "«", raquo: "»",
  yen: "¥", euro: "€", pound: "£", cent: "¢", micro: "µ", sup2: "²", sup3: "³", lsquo: "‘",
  rsquo: "’", ldquo: "“", rdquo: "”", ensp: " ", emsp: " ", thinsp: " ",
};

export function decodeEntities(text: string): string {
  return String(text ?? "").replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (all, body: string) => {
    if (body[0] === "#") {
      const n = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (Number.isFinite(n) && n > 0 && n <= 0x10ffff) {
        try {
          return String.fromCodePoint(n);
        } catch {
          return all;
        }
      }
      return all;
    }
    const hit = ENTITIES[body.toLowerCase()];
    return hit ?? all;
  });
}

const clean = (s: string) => decodeEntities(s).replace(/[\s\u00a0]+/g, " ").trim();

// ---------------------------------------------------------------- HTML → lines

type RowState = { cells: string[]; cell: string; container: number };

class LineBuilder {
  lines: string[] = [];
  containers: number[] = [];
  truncated = false;
  private bytes = 0;
  private nextContainer = 1;

  newContainer(): number {
    return this.nextContainer++;
  }

  push(text: string, container: number): void {
    if (this.truncated) return;
    const line = withoutPrices(clean(text));
    if (!line) return;
    const size = new TextEncoder().encode(line).length + 1;
    if (this.lines.length >= MAX_LINES || this.bytes + size > MAX_TEXT_BYTES) {
      this.truncated = true;
      return;
    }
    this.lines.push(line);
    this.containers.push(container);
    this.bytes += size;
  }
}

/** Parses one HTML page (already unpacked) into lines. Exported for the .mhtml path and the tests. */
export function htmlToSavedPage(html: string): { title: string; url: string | null; lines: string[]; containers: number[]; truncated: boolean } {
  const source = String(html ?? "");
  const title = clean((source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/<[^>]*>/g, " "));
  const savedFrom = source.match(/<!--\s*saved\s+from\s+url=\(\d+\)\s*([^<>\s]+)\s*-->/i)?.[1] ?? null;

  const b = new LineBuilder();
  const tableStack: number[] = [];
  const listStack: number[] = [];
  let row: RowState | null = null;
  let rowDepth = 0;
  let rowBase = 0;
  let rowPhysical = 0;
  let item: { text: string; container: number } | null = null;
  let itemDepth = 0;
  let itemBase = 0;
  let itemPhysical = 0;
  let block: { text: string; container: number } | null = null;
  let currentBlockContainer = 0;
  // A table/list nested in a line owner stays on that line only when it has ONE row/item (a layout table). With two or
  // more it is a list of rows: each row is its own line and the owner's text before it is its own line (SP-47).
  const tableSplit: boolean[] = [];
  const listSplit: boolean[] = [];
  type Owner = {
    row: RowState | null;
    rowBase: number;
    rowPhysical: number;
    item: { text: string; container: number } | null;
    itemBase: number;
    itemPhysical: number;
  };
  const tableOwners: Array<Owner | null> = [];
  const listOwners: Array<Owner | null> = [];

  const containerFor = () => tableStack[tableStack.length - 1] ?? listStack[listStack.length - 1] ?? (currentBlockContainer || (currentBlockContainer = b.newContainer()));

  const pushRowLine = () => {
    if (!row) return;
    const cells = [...row.cells];
    const last = clean(row.cell);
    if (last) cells.push(last);
    // Prices are dropped per cell, so a price-only cell never leaves an empty " | " on the line (RE-59).
    const kept = cells.map((c) => withoutPrices(c)).filter(Boolean);
    if (kept.length) b.push(kept.join(" | "), row.container);
    row.cells = [];
    row.cell = "";
  };
  const flushRow = () => {
    pushRowLine();
    row = null;
  };
  const pushItemLine = () => {
    if (!item) return;
    b.push(item.text, item.container);
    item.text = "";
  };
  const flushItem = () => {
    pushItemLine();
    item = null;
  };
  const flushBlock = () => {
    if (!block) return;
    b.push(block.text, block.container);
    block = null;
    currentBlockContainer = 0;
  };
  const pushText = (text: string) => {
    if (!text) return;
    if (row) row.cell += text;
    else if (item) item.text += text;
    else {
      if (!block) block = { text: "", container: currentBlockContainer || (currentBlockContainer = b.newContainer()) };
      block.text += text;
    }
  };
  const snapshot = (): Owner => ({ row, rowBase, rowPhysical, item, itemBase, itemPhysical });
  const restore = (o: Owner) => {
    row = o.row;
    rowBase = o.rowBase;
    rowPhysical = o.rowPhysical;
    item = o.item;
    itemBase = o.itemBase;
    itemPhysical = o.itemPhysical;
  };
  const suspendLineOwner = () => {
    // The owner's text before the nested table/list becomes its own line.
    if (row) {
      pushRowLine();
      row = null;
    } else if (item) {
      pushItemLine();
      item = null;
    }
  };

  const closeTo = (lower: string, from: number, tag: string): number => {
    const close = lower.indexOf(`</${tag}`, from);
    return close < 0 ? lower.length : close;
  };

  const lower = source.toLowerCase();
  // How many rows belong to this table itself (not to a table nested in one of its cells).
  const ownTableRows = (from: number): number => {
    let depth = 1;
    let rows = 0;
    let i = from;
    while (i < lower.length) {
      const lt = lower.indexOf("<", i);
      if (lt < 0) break;
      if (/^<table[\s>]/.test(lower.slice(lt, lt + 7))) {
        depth++;
        i = lt + 6;
        continue;
      }
      if (lower.startsWith("</table", lt)) {
        depth--;
        if (depth === 0) break;
        i = lt + 7;
        continue;
      }
      if (depth === 1 && /^<tr[\s>]/.test(lower.slice(lt, lt + 4))) rows++;
      i = lt + 1;
    }
    return rows;
  };
  const ownListItems = (from: number): number => {
    let depth = 1;
    let items = 0;
    let i = from;
    while (i < lower.length) {
      const lt = lower.indexOf("<", i);
      if (lt < 0) break;
      if (/^<(ul|ol)[\s>]/.test(lower.slice(lt, lt + 4))) {
        depth++;
        i = lt + 3;
        continue;
      }
      if (lower.startsWith("</ul", lt) || lower.startsWith("</ol", lt)) {
        depth--;
        if (depth === 0) break;
        i = lt + 4;
        continue;
      }
      if (depth === 1 && /^<li[\s>]/.test(lower.slice(lt, lt + 4))) items++;
      i = lt + 1;
    }
    return items;
  };

  let i = 0;
  while (i < source.length) {
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      i = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source[i] === "<") {
      const end = source.indexOf(">", i + 1);
      if (end < 0) break;
      const raw = source.slice(i + 1, end);
      const closing = raw.startsWith("/");
      const name = (raw.replace(/^\//, "").match(/^([a-z0-9]+)/i)?.[1] ?? "").toLowerCase();
      const attrs = raw.replace(/^\s*\/?[a-z0-9]+/i, "");

      // Never read script / style / svg / noscript: nothing from the page runs and none of it is part text.
      if (!closing && ["script", "style", "svg", "noscript"].includes(name)) {
        i = closeTo(lower, end + 1, name);
        const closeEnd = source.indexOf(">", i);
        i = closeEnd < 0 ? source.length : closeEnd + 1;
        continue;
      }

      if (name === "a" && !closing) {
        const titleAttr = attrs.match(/\btitle\s*=\s*("([^"]*)"|'([^']*)')/i);
        if (titleAttr) pushText(` ${decodeEntities(titleAttr[2] ?? titleAttr[3] ?? "")} `);
      }

      if (name === "table") {
        if (closing) {
          const split = tableSplit.pop() ?? true;
          const owner = tableOwners.pop() ?? null;
          if (split) flushRow();
          flushBlock();
          tableStack.pop();
          if (owner) restore(owner);
        } else {
          flushBlock();
          const nested = row !== null || item !== null || tableSplit.length > 0;
          const rows = nested ? ownTableRows(end + 1) : 0;
          const split = !nested || rows >= 2;
          const owner = split && nested ? snapshot() : null;
          if (split && nested) {
            suspendLineOwner();
            rowBase = rowDepth;
          }
          tableStack.push(b.newContainer());
          tableSplit.push(split);
          tableOwners.push(owner);
        }
      } else if (name === "tr") {
        if (closing) {
          rowDepth = Math.max(0, rowDepth - 1);
          if (row && rowPhysical === rowDepth + 1) flushRow();
        } else {
          const split = tableSplit[tableSplit.length - 1] ?? true;
          // SP-47: the outermost rows, and every row of a nested table with 2+ rows, make their own line.
          if (split && rowDepth === rowBase) {
            flushRow();
            flushBlock();
            row = { cells: [], cell: "", container: containerFor() };
            rowPhysical = rowDepth + 1;
          }
          rowDepth++;
        }
      } else if (name === "td" || name === "th") {
        if (row && rowDepth === rowPhysical) {
          const cell = clean(row.cell);
          if (cell) row.cells.push(cell);
          row.cell = "";
        } else if (row && rowDepth > rowPhysical) {
          // A layout table's cells are visually separate, but stay on this one line.
          pushText(" ");
        } else if (item && rowDepth > 0) {
          pushText(" ");
        }
      } else if (name === "ul" || name === "ol") {
        if (closing) {
          const split = listSplit.pop() ?? true;
          const owner = listOwners.pop() ?? null;
          if (split) flushItem();
          flushBlock();
          listStack.pop();
          if (owner) restore(owner);
        } else {
          flushBlock();
          const nested = item !== null || row !== null || listSplit.length > 0;
          const items = nested ? ownListItems(end + 1) : 0;
          const split = !nested || items >= 2;
          const owner = split && nested ? snapshot() : null;
          if (split && nested) {
            suspendLineOwner();
            itemBase = itemDepth;
          }
          listStack.push(listStack.length ? listStack[listStack.length - 1] : b.newContainer());
          listSplit.push(split);
          listOwners.push(owner);
        }
      } else if (name === "li") {
        if (closing) {
          itemDepth = Math.max(0, itemDepth - 1);
          if (item && itemPhysical === itemDepth + 1) flushItem();
        } else {
          const split = listSplit[listSplit.length - 1] ?? true;
          // SP-47: the outermost items, and every item of a nested list with 2+ items, make their own line.
          if (split && itemDepth === itemBase) {
            flushItem();
            flushBlock();
            item = { text: "", container: containerFor() };
            itemPhysical = itemDepth + 1;
          }
          itemDepth++;
        }
      } else if (name === "br" || name === "hr") {
        // A line break inside a row is a space in that one line, never a new line (SP-15).
        pushText(" ");
        flushBlock();
      } else if (["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "header", "footer", "main", "aside", "body", "html", "form", "dl", "dt", "dd", "figcaption", "nav"].includes(name)) {
        if (closing) flushBlock();
        else flushBlock();
      }
      i = end + 1;
      continue;
    }

    const next = source.indexOf("<", i);
    const text = source.slice(i, next < 0 ? source.length : next);
    pushText(text);
    i = next < 0 ? source.length : next;
  }
  flushRow();
  flushItem();
  flushBlock();

  return { title, url: savedFrom, lines: b.lines, containers: b.containers, truncated: b.truncated };
}

// ---------------------------------------------------------------- MHTML

type MimePart = { headers: Map<string, string>; body: string };

function parseHeaders(raw: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = raw.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([^:]+):\s*([\s\S]*)$/);
    if (m) headers.set(m[1].trim().toLowerCase(), m[2].trim());
  }
  return headers;
}

function charsetOf(contentType: string): string {
  return contentType.match(/charset\s*=\s*"?([^";]+)"?/i)?.[1]?.trim() || "utf-8";
}

function bytesFromBinaryString(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function decodeQuotedPrintable(s: string): Uint8Array {
  const soft = s.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    if (soft[i] === "=" && /^[0-9A-F]{2}$/i.test(soft.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(soft.charCodeAt(i) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function decodeTransfer(body: string, encoding: string): Uint8Array {
  const enc = encoding.trim().toLowerCase();
  if (enc === "base64") {
    const cleanBody = body.replace(/\s+/g, "");
    try {
      return bytesFromBinaryString(atob(cleanBody));
    } catch {
      return new TextEncoder().encode(body);
    }
  }
  if (enc === "quoted-printable") return decodeQuotedPrintable(body);
  return new TextEncoder().encode(body);
}

function textWithCharset(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Splits a MIME package into its parts; a single-part page is one part. */
function mimeParts(raw: string): { top: Map<string, string>; parts: MimePart[] } {
  const split = raw.match(/\r?\n\r?\n/);
  const head = split ? raw.slice(0, split.index) : "";
  const body = split ? raw.slice((split.index ?? 0) + split[0].length) : raw;
  const top = parseHeaders(head);
  const contentType = top.get("content-type") ?? "";
  const boundary = contentType.match(/boundary\s*=\s*"?([^";]+)"?/i)?.[1];
  if (!boundary || !/multipart\//i.test(contentType)) return { top, parts: [{ headers: top, body }] };
  const parts: MimePart[] = [];
  for (const chunk of body.split(`--${boundary}`)) {
    const part = chunk.replace(/^\r?\n/, "");
    if (!part || part.startsWith("--")) continue;
    const s = part.match(/\r?\n\r?\n/);
    const pHead = s ? part.slice(0, s.index) : "";
    const pBody = s ? part.slice((s.index ?? 0) + s[0].length) : "";
    parts.push({ headers: parseHeaders(pHead), body: pBody });
  }
  return { top, parts };
}

/** Unpacks the text/html part of a Webpage Single File page (SP-18), with its link and character set. */
export function mhtmlToSavedPage(bytes: Uint8Array): SavedPageText {
  const raw = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  const { top, parts } = mimeParts(raw);
  const htmlPart = parts.find((p) => /^text\/html/i.test(p.headers.get("content-type") ?? "")) ?? parts[0];
  if (!htmlPart) return { kind: "mhtml", title: "", url: null, lines: [], containers: [], truncated: false };
  const contentType = htmlPart.headers.get("content-type") ?? "";
  const decoded = decodeTransfer(htmlPart.body, htmlPart.headers.get("content-transfer-encoding") ?? "");
  const html = textWithCharset(decoded, charsetOf(contentType));
  const parsed = htmlToSavedPage(html);
  const headerUrl = htmlPart.headers.get("snapshot-content-location") ?? htmlPart.headers.get("content-location")
    ?? top.get("snapshot-content-location") ?? top.get("content-location") ?? null;
  return {
    kind: "mhtml",
    title: parsed.title,
    url: parsed.url ?? headerUrl,
    lines: parsed.lines,
    containers: parsed.containers,
    truncated: parsed.truncated,
  };
}

/** The whole R2: bytes + file name → numbered lines, title and the link the file carries. */
export function savedPageText(bytes: Uint8Array, fileName: string): SavedPageText {
  const kind = fileKindInfo(bytes, fileName);
  if (kind === "mhtml") return mhtmlToSavedPage(bytes);
  // A saved .html page may still name its character set in a meta tag.
  const head = latin1(bytes, 2048);
  const charset = head.match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1] ?? "utf-8";
  const html = textWithCharset(bytes, charset);
  const parsed = htmlToSavedPage(html);
  return { kind: "html", ...parsed };
}

// ---------------------------------------------------------------- §3.1 pictures inside the file
//
// A Chrome "Webpage, Single File" page packs every resource into one MIME file. The text reader above only ever
// hands back the HTML part, so the drawings and the image map were thrown away (PP-18). This section reads the raw
// bytes instead: it walks the parts, keeps each one's bytes, Content-ID and Content-Location, and links
// <img usemap="#m"> → <map name="m"> → the <area> whose title (or callout code) names the part.
//
// The whole file is decoded one byte to one character (latin1), never as UTF-8: a binary part would lose bytes.
// The HTML part is quoted-printable, so it is decoded before any tag is matched.

/** One picture inside the saved page. */
export type SavedPageImage = {
  contentType: string;
  bytes: Uint8Array;
  /** 0 when the bytes carry no readable size. */
  width: number;
  height: number;
  /** The map this image is wired to on the page (no "#"), or null when no <img> names one. */
  usemap: string | null;
  /** The <img src> or Content-Location the image was found by. */
  source: string;
};

/** One clickable region of an image map. */
export type SavedPageMapArea = {
  title: string;
  /** Every attribute as one string, so a callout code in data-* can be matched. */
  attrs: string;
  /** The part's rectangle as the page writes it. A HINT ONLY: Chrome scales these between .html and .mhtml. */
  box: { x1: number; y1: number; x2: number; y2: number } | null;
};

export type SavedPageImages = { images: SavedPageImage[]; maps: Record<string, SavedPageMapArea[]> };

export type PartDiagram = { image: SavedPageImage; mapBox: SavedPageMapArea["box"] };

const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** File extension for an image content type ("" when it is not a picture we store). */
export function imageExtension(contentType: string): string {
  return IMAGE_EXT[String(contentType ?? "").toLowerCase().split(";")[0].trim()] ?? "";
}

/** One byte = one character, in chunks (a spread over a whole 8 MB file would overflow the stack). */
function latin1String(bytes: Uint8Array): string {
  const CHUNK = 0x4000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
  }
  return parts.join("");
}

function splitHeadBody(part: string): { head: string; body: string } {
  const s = part.match(/\r?\n\r?\n/);
  if (!s) return { head: part, body: "" };
  return { head: part.slice(0, s.index), body: part.slice((s.index ?? 0) + s[0].length) };
}

/** The MIME parts' text blocks, split on the boundary at line starts only (a body may contain "--"). */
function mimePartTexts(raw: string): string[] {
  const firstBreak = raw.match(/\r?\n\r?\n/);
  const head = firstBreak ? raw.slice(0, firstBreak.index) : "";
  const bodyStart = firstBreak ? (firstBreak.index ?? 0) + firstBreak[0].length : 0;
  const boundary = parseHeaders(head).get("content-type")?.match(/boundary\s*=\s*"?([^";]+)"?/i)?.[1];
  const contentType = parseHeaders(head).get("content-type") ?? "";
  if (!boundary || !/multipart\//i.test(contentType)) return [raw];

  const marker = `--${boundary}`;
  const parts: string[] = [];
  let start = -1;
  let at = raw.indexOf(marker, bodyStart);
  while (at >= 0) {
    const lineStart = at === 0 || raw[at - 1] === "\n";
    if (!lineStart) {
      at = raw.indexOf(marker, at + marker.length);
      continue;
    }
    if (start >= 0) parts.push(raw.slice(start, at).replace(/^\r?\n/, "").replace(/\r?\n$/, ""));
    if (raw.slice(at + marker.length, at + marker.length + 2) === "--") {
      start = -1;
      break;
    }
    start = at + marker.length;
    at = raw.indexOf(marker, at + marker.length);
  }
  return parts;
}

function attribute(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function decodeUrl(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function locationMatches(location: string, src: string): boolean {
  const a = decodeUrl(location).split("?")[0].split("#")[0];
  const b = decodeUrl(src).split("?")[0].split("#")[0];
  if (!a || !b) return false;
  if (a === b) return true;
  const base = (s: string) => s.slice(s.lastIndexOf("/") + 1).toLowerCase();
  return base(a) === base(b) && base(a) !== "";
}

function contentIdMatches(id: string, src: string): boolean {
  const clean = (s: string) => s.trim().replace(/^</, "").replace(/>$/, "").toLowerCase();
  return clean(id) === clean(src.replace(/^cid:/i, ""));
}

function normalizedName(value: string | null | undefined): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

/** Label from a group line ("17801 - ELEMENT SUB-ASSY…" → "17801"): the 3–5 character token before " - ". */
export function partLabelFromGroupLine(line: string | null | undefined): string | null {
  const text = String(line ?? "").trim();
  const dash = text.search(/\s+-\s+/);
  if (dash < 0) return null;
  const head = text.slice(0, dash).trim();
  return /^[A-Z0-9]{3,5}$/i.test(head) ? head : null;
}

/** The part's own name from a group line ("17801 - ELEMENT SUB-ASSY…" → "ELEMENT SUB-ASSY…"). */
export function partAreaTitleFromGroupLine(line: string | null | undefined): string | null {
  const text = String(line ?? "").trim();
  const dash = text.search(/\s+-\s+/);
  if (dash < 0) return null;
  const tail = text.slice(dash).replace(/^\s+-\s+/, "").trim();
  return tail || null;
}

/** Width and height from the picture's own bytes (PNG, JPEG, GIF, WebP). 0/0 when unknown. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } {
  const be32 = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  const be16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return { width: be32(16), height: be32(20) };
  }
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  }
  if (bytes.length > 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) {
    // "RIFF"…"WEBP"
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
      return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
    }
    return { width: 0, height: 0 };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1];
      const size = be16(i + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { width: be16(i + 7), height: be16(i + 5) };
      if (size < 2) break;
      i += 2 + size;
    }
  }
  return { width: 0, height: 0 };
}

/** One part's body as its real bytes: base64, quoted-printable, or raw. Never a UTF-8 round trip. */
function partBytes(body: string, encoding: string): Uint8Array {
  const enc = encoding.trim().toLowerCase();
  if (enc === "base64") {
    try {
      return bytesFromBinaryString(atob(body.replace(/\s+/g, "")));
    } catch {
      return bytesFromBinaryString(body);
    }
  }
  if (enc === "quoted-printable") return decodeQuotedPrintable(body);
  return bytesFromBinaryString(body);
}

/**
 * Every picture and image map inside a Chrome single-file page (§3.1). Never throws: a file it cannot read comes
 * back empty, and the upload simply queues no pictures.
 */
export function readSingleFileImages(bytes: Uint8Array, fileName = "page.mhtml"): SavedPageImages {
  const empty: SavedPageImages = { images: [], maps: {} };
  try {
    if (fileKindInfo(bytes, fileName) !== "mhtml") return empty;
    const raw = latin1String(bytes);
    const decoded: Array<{ contentType: string; contentId: string; contentLocation: string; bytes: Uint8Array }> = [];
    for (const text of mimePartTexts(raw)) {
      const { head, body } = splitHeadBody(text);
      if (!head.trim()) continue;
      const headers = parseHeaders(head);
      const contentType = (headers.get("content-type") ?? "").toLowerCase();
      if (!contentType) continue;
      decoded.push({
        contentType,
        contentId: headers.get("content-id") ?? "",
        contentLocation: headers.get("content-location") ?? "",
        bytes: partBytes(body, headers.get("content-transfer-encoding") ?? ""),
      });
    }
    const htmlPart = decoded.find((p) => p.contentType.startsWith("text/html"));
    if (!htmlPart) return empty;
    const html = textWithCharset(htmlPart.bytes, charsetOf(htmlPart.contentType));

    // <img> tags: which image part each one points at, and the map it is wired to.
    const imgParts = new Map<string, { usemap: string | null; width: number; height: number; src: string }>();
    for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
      const src = attribute(tag, "src");
      if (!src) continue;
      const part = /^cid:/i.test(src)
        ? decoded.find((p) => contentIdMatches(p.contentId, src))
        : decoded.find((p) => locationMatches(p.contentLocation, src));
      if (!part) continue;
      const usemap = attribute(tag, "usemap");
      imgParts.set(part.contentLocation || part.contentId, {
        usemap: usemap ? usemap.replace(/^#/, "") : null,
        width: Number(attribute(tag, "width") ?? 0) || 0,
        height: Number(attribute(tag, "height") ?? 0) || 0,
        src,
      });
    }

    const maps: Record<string, SavedPageMapArea[]> = {};
    for (const mapTag of html.match(/<map\b[^>]*>[\s\S]*?<\/map>/gi) ?? []) {
      const name = attribute(mapTag.match(/<map\b[^>]*>/i)?.[0] ?? "", "name");
      if (!name) continue;
      for (const areaTag of mapTag.match(/<area\b[^>]*>/gi) ?? []) {
        const coords = (attribute(areaTag, "coords") ?? "").split(",").map((v) => Number(v.trim()));
        const box = coords.length >= 4 && coords.slice(0, 4).every((n) => Number.isFinite(n))
          ? { x1: coords[0], y1: coords[1], x2: coords[2], y2: coords[3] }
          : null;
        (maps[name] ??= []).push({
          title: decodeEntities(attribute(areaTag, "title") ?? ""),
          attrs: areaTag,
          box,
        });
      }
    }

    const images: SavedPageImage[] = [];
    for (const part of decoded) {
      const contentType = part.contentType.split(";")[0].trim();
      if (!imageExtension(contentType)) continue;
      const src = part.contentLocation || part.contentId;
      if (!src) continue;
      const wired = imgParts.get(part.contentLocation || part.contentId);
      const size = imageSize(part.bytes);
      images.push({
        contentType,
        bytes: part.bytes,
        width: size.width || wired?.width || 0,
        height: size.height || wired?.height || 0,
        usemap: wired?.usemap ?? null,
        source: src,
      });
    }
    return { images, maps };
  } catch (err) {
    console.error("single-file pictures unreadable", err);
    return empty;
  }
}

function areaNamesPart(area: SavedPageMapArea, wantedTitle: string, label: string | null): boolean {
  const areaTitle = normalizedName(area.title);
  if (wantedTitle && areaTitle) {
    if (areaTitle === wantedTitle) return true;
    if (wantedTitle.length >= 8 && (areaTitle.includes(wantedTitle) || wantedTitle.includes(areaTitle))) return true;
  }
  if (label) {
    const pattern = new RegExp(`(^|[^A-Z0-9])${label.replace(/[^A-Z0-9]/gi, "")}([^A-Z0-9]|$)`, "i");
    if (pattern.test(area.attrs)) return true;
  }
  return false;
}

/**
 * The drawing(s) for one part (§3.1): the image whose map names this part first, otherwise the largest images at
 * least 300 px each way. At most 3. No site names anywhere in the rule.
 */
export function diagramsForPart(
  set: SavedPageImages,
  part: { label?: string | null; groupLine?: string | null; partName?: string | null },
): PartDiagram[] {
  const wantedTitle = normalizedName(partAreaTitleFromGroupLine(part.groupLine) ?? part.partName ?? "");
  const label = String(part.label ?? "").trim().toUpperCase() || null;
  // One picture per image, even when several of its areas name the part: the same PNG is never sent twice.
  const foundByImage = new Map<string, PartDiagram>();
  for (const image of set.images) {
    if (!image.usemap) continue;
    for (const area of set.maps[image.usemap] ?? []) {
      if (!areaNamesPart(area, wantedTitle, label)) continue;
      if (foundByImage.has(image.source)) continue;
      foundByImage.set(image.source, { image, mapBox: area.box });
    }
  }
  if (foundByImage.size) return [...foundByImage.values()].slice(0, 3);
  return set.images
    .filter((i) => i.width >= 300 && i.height >= 300)
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, 3)
    .map((image) => ({ image, mapBox: null }));
}

