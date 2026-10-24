import type { ReactNode } from 'react';

export function ProvenanceBadge({
  source,
  validOn,
  version,
}: {
  source?: string | null;
  validOn?: string | null;
  version?: number | null;
}) {
  if (!source && version == null) return null;
  const label = version != null ? `From Dominion · v${version}` : ['Official', source, validOn].filter(Boolean).join(' · ');
  return (
    <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
      {label}
    </span>
  );
}

export function DominionEditLink({ children }: { children?: ReactNode }) {
  return (
    <a
      href="https://roamdominion.co/?page=world-parishes"
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-sky-300 hover:text-sky-200"
    >
      {children ?? 'Edit in Dominion'}
    </a>
  );
}
