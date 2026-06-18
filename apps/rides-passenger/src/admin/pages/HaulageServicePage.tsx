import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { VehicleTypesManager } from './VehicleTypesManager';
import { HaulageCatalogManager } from '../components/HaulageCatalogManager';

type OutletContext = { session: Session };

type Tab = 'transport' | 'catalog';

export function HaulageServicePage() {
  useOutletContext<OutletContext>();
  const [tab, setTab] = useState<Tab>('catalog');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        {(['catalog', 'transport'] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
              tab === id ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {id === 'catalog' ? 'Freight catalog' : 'Transport solutions'}
          </button>
        ))}
      </div>
      {tab === 'catalog' ? <HaulageCatalogManager /> : (
        <VehicleTypesManager kind="service" serviceCategory="haulage" />
      )}
    </div>
  );
}
