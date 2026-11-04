// Stitch AP10
import { MaterialIcon } from "../import/MaterialIcon";

const VOCAB = [
  { icon: "directions_car", title: "Car version", body: "A specific version of a model.", example: "Roomy · M900A · 2016–2020 · 1KR-FE" },
  { icon: "factory", title: "Factory number · OE", body: "The car maker's number for the original part.", example: "Toyota 04465-B1190" },
  { icon: "storefront", title: "Aftermarket part", body: "Another brand's version of the same part.", example: "MK Kashiyama D0051MH" },
  { icon: "sync_alt", title: "Replaces · cross-reference", body: "Links your part to the factory number it replaces.", example: "D0051MH replaces 04465-B1190" },
];

export function PlainWordsDrawer({ open, onClose, onViewTaxonomy }: { open: boolean; onClose: () => void; onViewTaxonomy?: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onClick={onClose}>
      <aside
        className="w-full max-w-[480px] h-full bg-surface-container-lowest border-l border-outline-variant/40 shadow-xl flex flex-col"
        role="dialog"
        aria-label="Parts in plain words"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="h-20 px-space-xl bg-surface-container-lowest flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-space-xs">
              <MaterialIcon name="menu_book" className="text-primary-container text-[20px]" />
              <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight font-bold">Parts in plain words</h2>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">A quick guide for fleet operators and catalog editors.</p>
          </div>
          <button type="button" className="w-8 h-8 rounded bg-surface-container hover:bg-surface-container-high flex items-center justify-center" onClick={onClose} aria-label="Close">
            <MaterialIcon name="close" className="text-[18px]" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-space-xl py-space-lg flex flex-col gap-space-xl bg-surface-bright">
          <section className="flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline font-bold">Four key ideas</span>
            </div>
            <div className="flex flex-col gap-space-sm">
              {VOCAB.map((v) => (
                <div key={v.title} className="p-space-md bg-surface-container-lowest rounded shadow-sm flex flex-col gap-space-xs">
                  <div className="flex items-center gap-space-sm">
                    <div className="w-7 h-7 rounded bg-surface-container-low text-primary-container flex items-center justify-center">
                      <MaterialIcon name={v.icon} className="text-[18px]" />
                    </div>
                    <span className="font-label-md text-label-md text-on-surface font-semibold">{v.title}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface font-medium pl-9">{v.body}</p>
                  <div className="ml-9 mt-1 inline-flex items-center px-2 py-1 rounded bg-surface-container-low font-mono-sm text-mono-sm text-primary">
                    <span className="font-semibold">{v.example}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline font-bold">Source &amp; trust</span>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Car maker&apos;s official parts catalogue or the part maker&apos;s own catalogue count as Verified; anything else is Needs checking until an owner reviews it.
            </p>
          </section>
        </div>
        <div className="px-space-xl py-space-md border-t border-outline-variant/30 flex flex-col gap-2 bg-surface-container-lowest">
          {onViewTaxonomy ? (
            <button type="button" className="text-left text-primary font-body-sm hover:underline" onClick={onViewTaxonomy}>
              View full taxonomy
            </button>
          ) : null}
          <button type="button" className="h-10 rounded-lg bg-primary-container text-on-primary font-label-md font-semibold" onClick={onClose}>
            Got it
          </button>
        </div>
      </aside>
    </div>
  );
}
