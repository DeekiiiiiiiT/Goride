import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { searchConsole, type ConsoleSearchHit } from '@roam/dash-admin-client';

type PageHit = { id: string; label: string; path: string };

export function CommandPalette({
  open,
  onClose,
  pages,
  accessToken,
  onGo,
}: {
  open: boolean;
  onClose: () => void;
  pages: PageHit[];
  accessToken: string;
  onGo: (path: string) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ConsoleSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ('');
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      void searchConsole(accessToken, q.trim())
        .then((res) => setHits(res.results ?? []))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [open, q, accessToken]);

  const pageHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return pages;
    return pages.filter((page) => page.label.toLowerCase().includes(needle));
  }, [pages, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close search" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 border-b border-slate-800">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search orders, people, stores, or a page"
            className="w-full bg-transparent py-3 text-sm text-white outline-none"
          />
        </div>
        <div className="max-h-80 overflow-auto p-2">
          {pageHits.length > 0 && (
            <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-slate-500">Pages</p>
          )}
          {pageHits.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => { onGo(page.path); onClose(); }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800"
            >
              {page.label}
            </button>
          ))}
          {searching && <p className="px-3 py-2 text-sm text-slate-500">Searching…</p>}
          {hits.length > 0 && (
            <p className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500">Matches</p>
          )}
          {hits.map((hit) => (
            <button
              key={`${hit.kind}-${hit.id}`}
              type="button"
              onClick={() => { onGo(hit.href); onClose(); }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800"
            >
              <span className="block text-sm text-slate-100">{hit.title}</span>
              <span className="block text-xs text-slate-500">{hit.subtitle}</span>
            </button>
          ))}
          {!searching && q.trim().length >= 2 && hits.length === 0 && pageHits.length === 0 && (
            <p className="px-3 py-6 text-sm text-slate-500 text-center">Nothing matched.</p>
          )}
        </div>
      </div>
    </div>
  );
}
