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
