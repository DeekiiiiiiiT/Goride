import { useEffect, useRef, useState } from "react";
import { getManualPageUrl } from "./manualsApi";
import { Icon } from "./manualsUi";
import { drawPage, openPdfUrl } from "./pdfTools";

/**
 * One manual page, drawn from the one-page PDF the server cuts. If the browser may not read the file (file store
 * permissions), it falls back to the browser's own PDF view of the same page, so the owner can always check it.
 */
export function PdfPagePreview({
  token,
  manualId,
  page,
  width = 480,
  zoomable = true,
}: {
  token: string;
  manualId: string;
  page: number;
  width?: number;
  zoomable?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "drawn" | "frame" | "error">("loading");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let live = true;
    setState("loading");
    setError("");
    void getManualPageUrl(token, manualId, page)
      .then(async (u) => {
        if (!live) return;
        setUrl(u);
        try {
          const doc = await openPdfUrl(u);
          if (!live || !canvasRef.current) return;
          await drawPage(doc, 1, canvasRef.current, Math.round(width * zoom));
          if (live) setState("drawn");
        } catch {
          if (live) setState("frame");
        }
      })
      .catch((e: unknown) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : "This page could not be shown.");
        setState("error");
      });
    return () => {
      live = false;
    };
  }, [token, manualId, page, width, zoom]);

  return (
    <div className="flex flex-col items-center gap-3" data-testid="mm-page-preview">
      <div className="relative overflow-auto rounded-lg bg-white shadow-[0_4px_20px_rgba(15,23,42,0.12)]" style={{ maxWidth: width + 24 }}>
        {state === "loading" ? (
          <div className="flex items-center justify-center bg-[#f3f4fb]" style={{ width, height: Math.round(width * 1.35) }}>
            <span className="text-[14px] text-[#5d5f68]">Loading page {page}…</span>
          </div>
        ) : null}
        {state === "error" ? (
          <div className="flex flex-col items-center justify-center gap-2 bg-[#f3f4fb] p-6 text-center" style={{ width, height: Math.round(width * 1.35) }}>
            <Icon name="description" className="text-[40px] text-[#c5c6d0]" />
            <span className="text-[14px] text-[#a83836]">{error}</span>
          </div>
        ) : null}
        {state === "frame" && url ? (
          <iframe title={`Manual page ${page}`} src={`${url}#toolbar=0&view=FitH`} style={{ width, height: Math.round(width * 1.35) }} />
        ) : null}
        <canvas ref={canvasRef} className={state === "drawn" ? "block" : "hidden"} />
      </div>
      <span className="rounded-full bg-[#f1f5f9] px-3 py-0.5 font-mono text-[12px] text-[#475569]">{page}</span>
      {zoomable && state === "drawn" ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#c5c6d0] bg-white hover:bg-[#f3f4fb] disabled:opacity-40"
            aria-label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
          >
            <Icon name="remove" className="text-[18px]" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#c5c6d0] bg-white hover:bg-[#f3f4fb] disabled:opacity-40"
            aria-label="Zoom in"
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
          >
            <Icon name="add" className="text-[18px]" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
