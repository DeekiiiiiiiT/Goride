import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { listHaulageAdminItems, updateHaulageVariant } from '../services/haulAdminService';

type OutletContext = { session: Session };

type VariantRow = {
  item_id: string;
  id: string;
  label: string;
  weight_kg: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  min_body_type_slug: string | null;
};

type ItemRow = {
  id: string;
  title: string;
  category_id: string;
  variants: VariantRow[];
};

export function HaulageCatalogManager() {
  const { session } = useOutletContext<OutletContext>();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VariantRow | null>(null);
  const [weightKg, setWeightKg] = useState('');

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const data = await listHaulageAdminItems(session.access_token);
      setItems(data.items as ItemRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveVariant = async () => {
    if (!session?.access_token || !editing) return;
    const w = Number(weightKg);
    if (!Number.isFinite(w) || w <= 0) {
      toast.error('Enter a valid weight');
      return;
    }
    try {
      await updateHaulageVariant(session.access_token, editing.item_id, editing.id, {
        label: editing.label,
        weight_kg: w,
        length_cm: editing.length_cm,
        width_cm: editing.width_cm,
        height_cm: editing.height_cm,
        min_body_type_slug: editing.min_body_type_slug,
      });
      toast.success('Variant updated');
      setEditing(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Manage freight items and variant specs (weight, dimensions, vehicle tier).
      </p>
      {items.map((item) => (
        <section key={item.id} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <h3 className="font-semibold text-white">{item.title}</h3>
          <p className="text-xs text-slate-500">{item.category_id}</p>
          <ul className="mt-3 space-y-2">
            {item.variants.map((v) => (
              <li
                key={`${v.item_id}-${v.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-sm"
              >
                <span className="text-slate-200">{v.label}</span>
                <span className="text-slate-400">{v.weight_kg} kg</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(v);
                    setWeightKg(String(v.weight_kg));
                  }}
                  className="rounded p-1 text-slate-400 hover:text-amber-300"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h4 className="text-lg font-semibold text-white">Edit {editing.label}</h4>
            <label className="mt-4 block text-sm text-slate-300">
              Weight (kg)
              <input
                type="number"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg px-4 py-2 text-sm text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveVariant()}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
