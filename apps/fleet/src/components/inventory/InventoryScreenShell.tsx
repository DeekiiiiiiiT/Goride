import type { ReactNode } from 'react';

/** Stitch fleet_operational_engine layout shell for inventory port screens. */
export function InventoryScreenShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-space-lg">
      <header className="mb-space-md space-y-1">
        <h2 className="text-headline-sm font-semibold text-on-surface">{title}</h2>
        {subtitle ? (
          <p className="text-body-md text-on-surface-variant">{subtitle}</p>
        ) : null}
      </header>
      <div className="space-y-2 text-body-sm text-on-surface-variant">{children}</div>
    </section>
  );
}

export function InventoryHeadingList({ labels }: { labels: string[] }) {
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {labels.map((label) => (
        <li key={label} className="rounded-lg bg-surface-container px-3 py-2 text-on-surface">
          {label}
        </li>
      ))}
    </ul>
  );
}
