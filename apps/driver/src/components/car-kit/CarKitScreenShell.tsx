import type { ReactNode } from 'react';

export function CarKitScreenShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-3 space-y-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-600 dark:text-slate-300">{subtitle}</p> : null}
      </header>
      <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">{children}</div>
    </section>
  );
}

export function CarKitHeadingList({ labels }: { labels: string[] }) {
  return (
    <ul className="grid gap-2">
      {labels.map((label) => (
        <li key={label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
          {label}
        </li>
      ))}
    </ul>
  );
}
