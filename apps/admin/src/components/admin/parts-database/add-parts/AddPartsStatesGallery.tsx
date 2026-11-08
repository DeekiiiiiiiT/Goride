/**
 * A12 — the six Add parts states, ported from docs/stitch/dominion-add-parts-self-serve/states_edge_cases/code.html.
 * Keep list (audit A12): bad link line, duplicate number, save failed banner, ask for a part type, skeletons,
 * leave-without-saving dialog. Everything else in the export (codes, tiers, audit trail, "Simulate mode") is dropped.
 */
import { toast } from "sonner";
import { PartsButton } from "../PartsButton";
import { MaterialIcon } from "../import/MaterialIcon";
import { AskPartTypePanel } from "./states/AskPartTypePanel";
import { D_CARD, D_MONO, D_MUTED, D_TXT } from "./catalog/dominionKit";

function Frame({ letter, title, children, wide }: { letter: string; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`${D_CARD} flex flex-col overflow-hidden ${wide ? "lg:col-span-2" : ""}`}>
      <div className="flex items-center gap-3 border-b border-[#e6e7ee] bg-[#f9f9fd] px-5 py-3 dark:border-[#1e293b] dark:bg-[#0b1220]">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0153dc] text-[13px] font-semibold text-white">{letter}</span>
        <p className={`text-[15px] font-semibold ${D_TXT}`}>{title}</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">{children}</div>
    </section>
  );
}

function Skel({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#eef0f6] dark:bg-[#1e293b] ${className}`} />;
}

export function AddPartsStatesGallery() {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <div>
        <h2 className={`text-[28px] font-semibold tracking-tight ${D_TXT}`}>What you see when something goes wrong</h2>
        <p className={`mt-1 text-[15px] ${D_MUTED}`}>Each message tells you what happened and what to do next. Nothing is saved until Save all.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Frame letter="A" title="The link isn't a web address">
          <div className="flex items-center gap-2 rounded-xl bg-[#f3f4fb] p-2 dark:bg-[#0b1220]">
            <MaterialIcon name="link" className="ml-2 text-[20px] text-[#5d5f68]" />
            <input
              readOnly
              aria-label="Catalogue page link"
              value="toyota part diagram brakes"
              className="h-11 flex-1 rounded-lg border border-[#a83836] bg-white px-3 text-[14px] ring-2 ring-[#a83836]/15 dark:bg-[#111a2e]"
            />
          </div>
          <p className="flex items-start gap-2 text-[14px] text-[#a83836] dark:text-[#f87171]">
            <MaterialIcon name="error" className="text-[18px]" />
            That doesn&apos;t look like a web link. Copy it from your browser&apos;s address bar.
          </p>
        </Frame>

        <Frame letter="B" title="The same number twice">
          {[
            { n: 1, num: "46410-B1011", dupe: true },
            { n: 2, num: "46410-B1011", dupe: true, note: true },
            { n: 3, num: "46420-B1090" },
          ].map((r) => (
            <div
              key={r.n}
              className={`flex flex-col gap-1 rounded-lg px-3 py-2.5 ${r.dupe ? "border border-[#f5d28a] bg-[#fff4dc] dark:border-[#78350f] dark:bg-[#451a03]" : "bg-[#f3f4fb] dark:bg-[#0b1220]"}`}
            >
              <div className="flex items-center gap-3">
                <span className={`text-[13px] ${D_MUTED}`}>Row {r.n}</span>
                <span className={`${D_MONO} text-[15px] font-semibold ${D_TXT}`}>{r.num}</span>
              </div>
              {r.note ? (
                <p className="flex items-center gap-1.5 text-[13px] text-[#8a5a00] dark:text-[#fbbf24]">
                  <MaterialIcon name="warning" className="text-[16px]" /> This number is already in row 1.
                </p>
              ) : null}
            </div>
          ))}
        </Frame>

        <Frame letter="C" title="Save failed" wide>
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-[#f3c4c3] bg-[#fdecec] p-5 dark:border-[#7f1d1d] dark:bg-[#450a0a] sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#a83836] text-white">
                <MaterialIcon name="cloud_off" className="text-[22px]" />
              </span>
              <div>
                <p className="text-[18px] font-semibold text-[#a83836] dark:text-[#f87171]">Nothing was saved. Your rows are still here.</p>
                <p className={`text-[14px] ${D_MUTED}`}>Check your connection, then try again.</p>
              </div>
            </div>
            <PartsButton variant="secondary">
              <MaterialIcon name="refresh" className="text-[18px]" /> Try again
            </PartsButton>
          </div>
        </Frame>

        <Frame letter="D" title="The part type isn't in the list">
          <AskPartTypePanel
            onSubmit={async () => {
              toast.success("Part type request sent");
            }}
          />
        </Frame>

        <Frame letter="E" title="Loading">
          <Skel className="h-11 w-full" />
          <Skel className="h-12 w-full" />
          <Skel className="h-12 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Skel className="h-24" />
            <Skel className="h-24" />
          </div>
        </Frame>

        <Frame letter="F" title="Leaving with unsaved rows" wide>
          <div className="mx-auto w-full max-w-lg rounded-2xl border border-[#e6e7ee] bg-white p-6 shadow-xl dark:border-[#1e293b] dark:bg-[#111a2e]">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fdecec] dark:bg-[#450a0a]">
                <MaterialIcon name="delete_forever" className="text-[22px] text-[#a83836]" />
              </span>
              <div>
                <p className={`text-[19px] font-semibold ${D_TXT}`}>Leave without saving?</p>
                <p className={`mt-1 text-[14px] ${D_MUTED}`}>The 3 part rows will be lost.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <PartsButton variant="secondary">Keep editing</PartsButton>
              <PartsButton variant="danger" confirm>
                <MaterialIcon name="close" className="text-[18px]" /> Leave without saving
              </PartsButton>
            </div>
          </div>
        </Frame>
      </div>
    </div>
  );
}
