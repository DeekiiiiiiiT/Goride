/**
 * §3.1 pictures inside a saved single-file page (PP-18).
 *
 * The committed fixture (fixtures/single-file-diagram.mhtml) is hand-built: Blink-style headers, a
 * quoted-printable text/html part with made-up group lines and numbers, an <img usemap> + <map> + <area> set, one
 * base64 PNG part, one binary PNG part and a CSS part. No real page, numbers, car or site.
 *
 * One test also reads the owner's real single-file page from their Downloads folder, and is skipped when that file
 * is not there, so CI never needs it.
 *
 * deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/saved_page_images.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  diagramsForPart,
  imageExtension,
  imageSize,
  partAreaTitleFromGroupLine,
  partLabelFromGroupLine,
  readSingleFileImages,
  savedPageText,
} from "./saved_page_text.ts";

const FIXTURE = new URL("./fixtures/single-file-diagram.mhtml", import.meta.url);
const FIXTURE_NAME = "single-file-diagram.mhtml";

/** The owner's own saved page, found in their Downloads folder when it is there (never committed, never in CI). */
function ownerSamplePath(): string | null {
  const home = Deno.env.get("USERPROFILE") || Deno.env.get("HOME") || "";
  if (!home) return null;
  const dir = `${home}/Downloads`;
  try {
    for (const entry of Deno.readDirSync(dir)) {
      const name = entry.name.toLowerCase();
      if (entry.isFile && name.endsWith(".mhtml") && name.includes("air cleaner")) {
        return `${dir}/${entry.name}`;
      }
    }
  } catch {
    // no Downloads folder on this machine
  }
  return null;
}

const OWNER_SAMPLE = ownerSamplePath();

const enc = (s: string) => new TextEncoder().encode(s);

// ---------------------------------------------------------------- helpers for made-up pages

/** A minimal PNG (signature + IHDR) — enough for the signature check and the size. */
function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function binaryString(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/** One picture part of a made-up single-file page. `binary` writes raw bytes: never a UTF-8 round trip. */
type MimeImage = { location: string; bytes: Uint8Array; binary?: boolean };

/** A Chrome-style single-file page: one HTML part plus the given image parts, built as raw bytes. */
function mhtmlPage(opts: { html: string; images?: MimeImage[]; boundary?: string }): Uint8Array {
  const boundary = opts.boundary ?? "----MultipartBoundary--TESTBOUNDARY----";
  const out: Uint8Array[] = [];
  out.push(asciiBytes(
    [
      "From: <Saved by Blink>",
      "Snapshot-Content-Location: https://catalog.example/parts/ZZ999",
      "MIME-Version: 1.0",
      `Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/html",
      "Content-Transfer-Encoding: quoted-printable",
      "Content-Location: https://catalog.example/parts/ZZ999",
      "",
      "",
    ].join("\r\n"),
  ));
  out.push(asciiBytes(opts.html.replace(/=/g, "=3D")));
  out.push(asciiBytes("\r\n"));
  for (const image of opts.images ?? []) {
    out.push(asciiBytes(
      [
        `--${boundary}`,
        "Content-Type: image/png",
        `Content-Transfer-Encoding: ${image.binary ? "binary" : "base64"}`,
        `Content-Location: ${image.location}`,
        "",
        "",
      ].join("\r\n"),
    ));
    out.push(image.binary ? image.bytes : asciiBytes(btoa(binaryString(image.bytes))));
    out.push(asciiBytes("\r\n"));
  }
  out.push(asciiBytes(`--${boundary}--\r\n`));
  return concatBytes(out);
}

// ---------------------------------------------------------------- the committed fixture

Deno.test("§3.1 the committed fixture: two pictures, one image map, the CSS part skipped", async () => {
  const set = readSingleFileImages(await Deno.readFile(FIXTURE), FIXTURE_NAME);

  assertEquals(set.images.length, 2);
  const [diagram, photo] = set.images;

  assertEquals(diagram.contentType, "image/png");
  assertEquals([diagram.width, diagram.height], [400, 300]);
  assertEquals(diagram.usemap, "map1_99901");
  assert(diagram.source.endsWith("diagram-a.png"), diagram.source);
  // A real PNG, decoded from a base64 part.
  assertEquals([...diagram.bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  assertEquals(photo.contentType, "image/png");
  assertEquals([photo.width, photo.height], [640, 480]);
  assertEquals(photo.usemap, null);
  assert(photo.source.endsWith("photo-b.png"), photo.source);
  // The binary-transfer part is kept byte for byte.
  assertEquals(photo.bytes.length, 2321);
  assertEquals([...photo.bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  assertEquals(Object.keys(set.maps), ["map1_99901"]);
  assertEquals(set.maps["map1_99901"].length, 2);
  assertEquals(set.maps["map1_99901"].map((a) => a.title), ["ELEMENT SUB-ASSY, TEST FILTER", "CAP SUB-ASSY, TEST FILTER"]);
  assertEquals(set.maps["map1_99901"].map((a) => a.box), [
    { x1: 10, y1: 20, x2: 30, y2: 40 },
    { x1: 50, y1: 60, x2: 70, y2: 80 },
  ]);
});

Deno.test("§3.1 the committed fixture: each part's group line finds its own rectangle", async () => {
  const set = readSingleFileImages(await Deno.readFile(FIXTURE), FIXTURE_NAME);

  const filter = "99901 - ELEMENT SUB-ASSY, TEST FILTER";
  assertEquals(partLabelFromGroupLine(filter), "99901");
  assertEquals(partAreaTitleFromGroupLine(filter), "ELEMENT SUB-ASSY, TEST FILTER");
  const filterDiagrams = diagramsForPart(set, { label: "99901", groupLine: filter });
  assertEquals(filterDiagrams.length, 1);
  assertEquals(filterDiagrams[0].image.width, 400);
  assertEquals(filterDiagrams[0].mapBox, { x1: 10, y1: 20, x2: 30, y2: 40 });

  const cap = "99902 - CAP SUB-ASSY, TEST FILTER";
  const capDiagrams = diagramsForPart(set, { label: "99902", groupLine: cap });
  assertEquals(capDiagrams.length, 1);
  assertEquals(capDiagrams[0].image.width, 400);
  assertEquals(capDiagrams[0].mapBox, { x1: 50, y1: 60, x2: 70, y2: 80 });

  // A part the map does not name falls back to the largest pictures at least 300 px each way.
  const other = diagramsForPart(set, { label: null, groupLine: "99903 - HOSE, TEST" });
  assertEquals(other.map((d) => d.image.width), [640, 400]);
  assertEquals(other.map((d) => d.mapBox), [null, null]);
});

Deno.test("§3.1 the committed fixture: the text reader still reads the page beside the picture reader", async () => {
  const page = savedPageText(await Deno.readFile(FIXTURE), FIXTURE_NAME);
  assertEquals(page.kind, "mhtml");
  assertEquals(page.title, "Test catalogue page ZZ999-AAAA 11.2016 - 09.2020");
  assertEquals(page.lines.length, 7);
  assert(page.lines.includes("99901 - ELEMENT SUB-ASSY, TEST FILTER"), page.lines.join(" | "));
  assert(page.lines.includes("99902 - CAP SUB-ASSY, TEST FILTER"), page.lines.join(" | "));
  assert(
    page.lines.some((line) => line.includes("99999-Z0101") && line.includes("11.2016") && line.includes("09.2020")),
    page.lines.join(" | "),
  );
});

Deno.test("§3.1 the committed fixture holds no real page, part, car or site", async () => {
  const text = new TextDecoder("latin1").decode(await Deno.readFile(FIXTURE));
  for (const marker of ["M900A", "179509A", "17801", "Amayama", "Toyota", "Roomy"]) {
    assert(!text.includes(marker), `the fixture must not contain ${marker}`);
  }
});

// ---------------------------------------------------------------- the owner's real page (skipped unless present)

Deno.test({
  name: "§3.1 the owner's real page (only when it is in Downloads): Chrome's own file still parses and its map links",
  ignore: !OWNER_SAMPLE,
  fn: async () => {
    const bytes = await Deno.readFile(OWNER_SAMPLE!);
    const set = readSingleFileImages(bytes);

    // Structure only, never the page's own part numbers: one real PNG, wired to an image map.
    assertEquals(set.images.length, 1);
    const image = set.images[0];
    assertEquals(image.contentType, "image/png");
    assertEquals([...image.bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert(image.bytes.length > 10_000, `suspiciously small diagram: ${image.bytes.length}`);
    assert(image.width >= 300 && image.height >= 300, `${image.width}x${image.height}`);
    assert(image.usemap, "the real page wires its diagram to an image map");

    // Play it back as a made-up group row: the first area's title must find that same image and rectangle.
    const area = set.maps[image.usemap!][0];
    assert(area, "the map must have at least one area");
    const diagrams = diagramsForPart(set, { label: null, groupLine: `99999 - ${area.title}` });
    assertEquals(diagrams.length, 1);
    assertEquals(diagrams[0].image.bytes.length, image.bytes.length);
    assertEquals(diagrams[0].mapBox, area.box);
  },
});

// ---------------------------------------------------------------- made-up pages, built in the test

Deno.test("§3.1 label and area title come from the group row; no group row gives null", () => {
  assertEquals(partLabelFromGroupLine("99910 - ABSORBER SET, TEST"), "99910");
  assertEquals(partLabelFromGroupLine("GROUP 77777U - ABSORBER SET, TEST"), null);
  assertEquals(partAreaTitleFromGroupLine("GROUP 77777U - ABSORBER SET, TEST"), "ABSORBER SET, TEST");
  assertEquals(partAreaTitleFromGroupLine("No dash here"), null);
  assertEquals(partLabelFromGroupLine(null), null);
});

Deno.test("§3.1 imageExtension maps the picture types and nothing else", () => {
  assertEquals(imageExtension("image/png"), "png");
  assertEquals(imageExtension("image/jpeg"), "jpg");
  assertEquals(imageExtension("image/webp"), "webp");
  assertEquals(imageExtension("image/gif"), "gif");
  assertEquals(imageExtension("text/css"), "");
  assertEquals(imageExtension(""), "");
});

Deno.test("§3.1 a page with no image map falls back to the largest pictures at least 300 px each way, at most 3", () => {
  const html = `<html><body><img src="https://x.example/logo.png"><p>Test filter</p></body></html>`;
  const page = mhtmlPage({
    html,
    images: [
      { location: "https://x.example/logo.png", bytes: pngBytes(200, 200) }, // under 300: never chosen
      { location: "https://x.example/big.png", bytes: pngBytes(800, 600) },
      { location: "https://x.example/tall.png", bytes: pngBytes(300, 900) },
      { location: "https://x.example/wide.png", bytes: pngBytes(1000, 300) },
      { location: "https://x.example/floor.png", bytes: pngBytes(300, 300) }, // exactly 300: allowed
    ],
  });
  const set = readSingleFileImages(page);
  assertEquals(set.images.length, 5);
  assertEquals(set.images.map((i) => `${i.width}x${i.height}`), ["200x200", "800x600", "300x900", "1000x300", "300x300"]);

  const diagrams = diagramsForPart(set, { label: null, groupLine: "99999 - SHOCK ABSORBER", partName: "Shock absorber" });
  // 800x600 (480k), 1000x300 (300k), 300x900 (270k) — the 200x200 is too small and the 300x300 is fourth.
  assertEquals(diagrams.map((d) => `${d.image.width}x${d.image.height}`), ["800x600", "1000x300", "300x900"]);
  assertEquals(diagrams.map((d) => d.mapBox), [null, null, null]);
});

Deno.test("§3.1 the image whose map names the part wins over the larger ones", () => {
  const html = `<html><body>
    <img src="https://x.example/diagram.png" usemap="#mapA">
    <img src="https://x.example/photo.png" usemap="#mapB">
    <map name="mapA"><area shape="rect" coords="10,20,30,40" title="ABSORBER SET, TEST" data-key="1_B0200-99910"></map>
    <map name="mapB"><area shape="rect" coords="1,2,3,4" title="Something else"></map>
  </body></html>`;
  const page = mhtmlPage({
    html,
    images: [
      { location: "https://x.example/diagram.png", bytes: pngBytes(400, 400) },
      { location: "https://x.example/photo.png", bytes: pngBytes(2000, 2000) },
    ],
  });
  const set = readSingleFileImages(page);
  const diagrams = diagramsForPart(set, { label: "99910", groupLine: "99910 - ABSORBER SET, TEST" });
  assertEquals(diagrams.length, 1);
  assertEquals(diagrams[0].image.width, 400);
  assertEquals(diagrams[0].mapBox, { x1: 10, y1: 20, x2: 30, y2: 40 });
});

Deno.test("§3.1 a callout code in data-key finds the part when the titles differ", () => {
  const html = `<html><body>
    <img src="https://x.example/diagram.png" usemap="#mapA">
    <map name="mapA"><area shape="rect" coords="5,6,7,8" title="ELEMENT SUB-ASSY" data-key="1_C0300-99911"></map>
  </body></html>`;
  const page = mhtmlPage({ html, images: [{ location: "https://x.example/diagram.png", bytes: pngBytes(500, 500) }] });
  const set = readSingleFileImages(page);
  const diagrams = diagramsForPart(set, { label: "99911", groupLine: "99911 - A DIFFERENT NAME AS WRITTEN" });
  assertEquals(diagrams.length, 1);
  assertEquals(diagrams[0].mapBox, { x1: 5, y1: 6, x2: 7, y2: 8 });
});

Deno.test("§3.1 one picture per image, even when several of its areas name the part", () => {
  const html = `<html><body>
    <img src="https://x.example/diagram.png" usemap="#mapA">
    <map name="mapA">
      <area coords="1,2,3,4" title="ELEMENT SUB-ASSY, TEST FILTER">
      <area coords="5,6,7,8" title="ELEMENT SUB-ASSY, TEST FILTER">
    </map>
  </body></html>`;
  const page = mhtmlPage({ html, images: [{ location: "https://x.example/diagram.png", bytes: pngBytes(400, 400) }] });
  const set = readSingleFileImages(page);
  const diagrams = diagramsForPart(set, { label: null, groupLine: "99901 - ELEMENT SUB-ASSY, TEST FILTER" });
  assertEquals(diagrams.length, 1);
  assertEquals(diagrams[0].mapBox, { x1: 1, y1: 2, x2: 3, y2: 4 });
});

Deno.test("§3.1 a binary-transfer image part is kept byte for byte", () => {
  const png = pngBytes(547, 801);
  const page = mhtmlPage({
    html: `<html><body><img src="https://x.example/d.png" usemap="#m"><map name="m"><area coords="1,1,2,2" title="SHOCK"></map></body></html>`,
    images: [{ location: "https://x.example/d.png", bytes: png, binary: true }],
  });
  const set = readSingleFileImages(page);
  assertEquals(set.images.length, 1);
  assertEquals(set.images[0].bytes.length, png.length);
  assertEquals([...set.images[0].bytes], [...png]);
  assertEquals([set.images[0].width, set.images[0].height], [547, 801]);
});

Deno.test("§3.1 a plain .html page has no pictures inside it", () => {
  const set = readSingleFileImages(enc(`<html><body><img src="./page_files/diagram.png" usemap="#m"></body></html>`), "page.html");
  assertEquals(set.images, []);
  assertEquals(set.maps, {});
});

Deno.test("§3.1 a file that is not a single-file page, or is broken, comes back empty and never throws", () => {
  assertEquals(readSingleFileImages(enc("just some text")).images, []);
  const truncated = new TextEncoder().encode(
    'MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="b"\r\n\r\n--b\r\nContent-Type: text/html\r\n\r\n<html><body><img src="cid:x">',
  );
  const set = readSingleFileImages(truncated);
  assertEquals(set.images, []);
});

Deno.test("§3.1 no map and no picture big enough gives no diagram", () => {
  const page = mhtmlPage({
    html: `<html><body><img src="https://x.example/small.png"></body></html>`,
    images: [{ location: "https://x.example/small.png", bytes: pngBytes(120, 90) }],
  });
  const set = readSingleFileImages(page);
  assertEquals(set.images.length, 1);
  assertEquals(diagramsForPart(set, { label: null, groupLine: "99999 - SHOCK ABSORBER" }), []);
});

Deno.test("§3.1 imageSize reads PNG, GIF and JPEG headers", () => {
  assertEquals(imageSize(pngBytes(11, 22)), { width: 11, height: 22 });
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x05, 0x00, 0x07, 0x00]);
  assertEquals(imageSize(gif), { width: 5, height: 7 });
  // JPEG: SOI, APP0 (length 4), then SOF0 with height 0x0102 and width 0x0203.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x02, 0x02, 0x03, 0x00, 0x00, 0x00]);
  assertEquals(imageSize(jpeg), { width: 0x0203, height: 0x0102 });
  assertEquals(imageSize(new Uint8Array([1, 2, 3])), { width: 0, height: 0 });
});
