import { describe, expect, it } from "vitest";
import { linkInSavedFile } from "./SavedPageOverlay";

describe("linkInSavedFile", () => {
  it("reads the link from a plain .html save", () => {
    expect(linkInSavedFile('<!DOCTYPE html>\n<!-- saved from url=(0036)https://catalog.example/epc/m900a/1 -->\n<html>')).toBe(
      "https://catalog.example/epc/m900a/1",
    );
  });

  it("reads the web link from a single-file save whose header points at a local file (quoted-printable comment)", () => {
    const head = [
      "From: <Saved by Blink>",
      "Snapshot-Content-Location: file:///C:/sample/page.html",
      "MIME-Version: 1.0",
      "",
      "------MultipartBoundary--x",
      "Content-Type: text/html",
      "Content-Transfer-Encoding: quoted-printable",
      "Content-Location: file:///C:/sample/page.html",
      "",
      "<!DOCTYPE html><!-- saved from url=3D(0063)https://catalog.example/epc/m900a/1=",
      "47989/engine/1703?search=3Dair+filter&match=3D1 --><html lang=3D\"en\">",
    ].join("\r\n");
    expect(linkInSavedFile(head)).toBe("https://catalog.example/epc/m900a/147989/engine/1703?search=air+filter&match=1");
  });

  it("uses the header link of a single-file save made straight from the website", () => {
    expect(linkInSavedFile("From: <Saved by Blink>\r\nSnapshot-Content-Location: https://catalog.example/epc/m900a/2\r\n")).toBe(
      "https://catalog.example/epc/m900a/2",
    );
  });

  it("never offers a local file address as the page link", () => {
    expect(linkInSavedFile("From: <Saved by Blink>\r\nSnapshot-Content-Location: file:///C:/sample/page.html\r\n")).toBeNull();
  });
});
