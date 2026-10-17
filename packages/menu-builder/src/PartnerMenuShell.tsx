import { useEffect, useState } from 'react';
import { BUILTIN_KITS, type MenuSnapshot, type ProductType } from '@roam/menu-engine';
import { ProductTypeEditor } from './ProductTypeEditor.tsx';
import { KitStarter } from './KitStarter.tsx';

export type PartnerMenuPersistence = {
  load: () => Promise<{ snapshot: MenuSnapshot | null }>;
  saveDraft: (snapshot: MenuSnapshot) => Promise<void>;
  publish: (snapshot: MenuSnapshot) => Promise<void>;
};

/** Shared partner / rush-command mount for pizza, wings, and combo editors. */
export function PartnerMenuShell({
  cuisineHints = [],
  persistence,
}: {
  cuisineHints?: string[];
  /** When set, drafts/publish hit the same engine APIs as admin. */
  persistence?: PartnerMenuPersistence;
}) {
  const [snapshot, setSnapshot] = useState<MenuSnapshot>(() => ({
    menuId: 'partner-draft',
    version: 0,
    groups: [],
    priceMatrix: [],
    products: [],
    sections: [],
  }));
  const [productId, setProductId] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!persistence) return;
    void (async () => {
      try {
        const data = await persistence.load();
        if (data.snapshot) {
          setSnapshot(data.snapshot);
          if (data.snapshot.products[0]) setProductId(data.snapshot.products[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load engine menu');
      }
    })();
  }, [persistence]);

  const kits = BUILTIN_KITS.filter((kit) => {
    if (!cuisineHints.length) return true;
    return cuisineHints.some((c) => c.toLowerCase() === kit.cuisine.toLowerCase());
  });

  function addProduct(type: ProductType) {
    const id = crypto.randomUUID();
    const sectionId = snapshot.sections[0]?.id || crypto.randomUUID();
    const sections = snapshot.sections.length
      ? snapshot.sections
      : [{ id: sectionId, name: 'Menu', sectionType: type, sort: 0 }];
    setSnapshot({
      ...snapshot,
      sections,
      products: [
        ...snapshot.products,
        {
          id,
          sectionId,
          type,
          name: type === 'pizza' ? 'New pizza' : type === 'wings' ? 'New wings' : type === 'combo' ? 'New deal' : 'New item',
          basePrice: 0,
          groupLinks: [],
          pizza: type === 'pizza' ? { halfPriceRule: 'full', maxToppings: 10, specialtyMode: 'build' } : null,
          wings: type === 'wings' ? { flavourPerPieces: 6, flavourGroupId: '', piecesGroupId: '' } : null,
          comboSlots: type === 'combo' ? [] : undefined,
        },
      ],
    });
    setProductId(id);
  }

  async function saveDraft() {
    if (!persistence) return;
    setBusy(true);
    setError('');
    try {
      await persistence.saveDraft(snapshot);
      setStatus('Draft saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!persistence) return;
    setBusy(true);
    setError('');
    try {
      await persistence.saveDraft(snapshot);
      await persistence.publish(snapshot);
      setStatus('Published');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-outline-variant bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-on-surface">Advanced menu builder</h3>
          <p className="text-sm text-on-surface-variant">
            Same engine as In-House — pizza, wings, and combo deals.
            {status ? ` · ${status}` : persistence ? '' : ' · Local draft only until linked'}
          </p>
        </div>
        {persistence ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !snapshot.products.length}
              className="rounded-lg border border-outline-variant px-3 py-1.5 text-sm"
              onClick={() => {
                const now = new Date().toISOString();
                setSnapshot((current) => ({
                  ...current,
                  products: current.products.map((p) => ({ ...p, priceCheckedAt: now })),
                }));
                setStatus('Prices confirmed');
              }}
            >
              Confirm prices
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-outline-variant px-3 py-1.5 text-sm"
              onClick={() => void saveDraft()}
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-on-primary"
              onClick={() => void publish()}
            >
              Publish
            </button>
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {!snapshot.products.length ? (
        <KitStarter
          kits={kits}
          onApply={(kit) => {
            setSnapshot((current) => ({
              ...current,
              sections: [
                ...current.sections,
                ...kit.payload.sections.map((section, i) => ({
                  id: crypto.randomUUID(),
                  name: section.name,
                  sectionType: section.sectionType as MenuSnapshot['sections'][0]['sectionType'],
                  sort: current.sections.length + i,
                })),
              ],
            }));
          }}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(['pizza', 'wings', 'combo'] as ProductType[]).map((type) => (
          <button
            key={type}
            type="button"
            className="rounded-full border border-outline-variant px-3 py-1 text-sm capitalize"
            onClick={() => addProduct(type)}
          >
            + {type}
          </button>
        ))}
      </div>
      {snapshot.products.length > 0 ? (
        <>
          <select
            className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            {snapshot.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type})
              </option>
            ))}
          </select>
          <ProductTypeEditor
            snapshot={snapshot}
            productId={productId}
            onChange={setSnapshot}
            markupBps={0}
            onConfirmPrices={() => {
              const now = new Date().toISOString();
              setSnapshot((current) => ({
                ...current,
                products: current.products.map((p) => ({ ...p, priceCheckedAt: now })),
              }));
              setStatus('Prices confirmed');
            }}
          />
        </>
      ) : null}
    </div>
  );
}
