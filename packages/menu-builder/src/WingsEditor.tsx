import type { MenuProduct, MenuSnapshot } from '@roam/menu-engine';

export function WingsEditor({
  snapshot,
  productId,
  onChange,
}: {
  snapshot: MenuSnapshot;
  productId: string;
  onChange: (next: MenuSnapshot) => void;
}) {
  const product = snapshot.products.find((p) => p.id === productId);
  if (!product) return null;

  function update(patch: Partial<MenuProduct>) {
    onChange({
      ...snapshot,
      products: snapshot.products.map((p) => (p.id === productId ? { ...p, ...patch } : p)),
    });
  }

  const piecesGroupId = product.wings?.piecesGroupId || product.groupLinks[0]?.groupId || '';
  const flavourGroupId = product.wings?.flavourGroupId || product.groupLinks[1]?.groupId || '';

  return (
    <div className="space-y-4 rounded-lg border border-[#d7e0f2] p-4">
      <h3 className="text-sm font-semibold text-[#0f172a]">Wings rules</h3>
      <p className="text-xs text-[#5f75a5]">Piece count × style prices live on the Count group. Flavours required = pieces ÷ this number.</p>
      <label className="block text-xs text-[#5f75a5]">
        1 flavour per N pieces
        <input
          type="number"
          min={1}
          className="mt-1 w-32 rounded border border-[#d7e0f2] px-2 py-1 text-sm"
          value={product.wings?.flavourPerPieces ?? 6}
          onChange={(e) =>
            update({
              type: 'wings',
              wings: {
                flavourPerPieces: Math.max(1, Number(e.target.value) || 6),
                piecesGroupId,
                flavourGroupId,
              },
            })
          }
        />
      </label>
      <label className="block text-xs text-[#5f75a5]">
        Pieces group id
        <input
          className="mt-1 w-full rounded border border-[#d7e0f2] px-2 py-1 text-sm"
          value={piecesGroupId}
          onChange={(e) =>
            update({
              wings: {
                flavourPerPieces: product.wings?.flavourPerPieces ?? 6,
                piecesGroupId: e.target.value,
                flavourGroupId,
              },
            })
          }
        />
      </label>
      <label className="block text-xs text-[#5f75a5]">
        Flavour group id
        <input
          className="mt-1 w-full rounded border border-[#d7e0f2] px-2 py-1 text-sm"
          value={flavourGroupId}
          onChange={(e) =>
            update({
              wings: {
                flavourPerPieces: product.wings?.flavourPerPieces ?? 6,
                piecesGroupId,
                flavourGroupId: e.target.value,
              },
            })
          }
        />
      </label>
    </div>
  );
}
