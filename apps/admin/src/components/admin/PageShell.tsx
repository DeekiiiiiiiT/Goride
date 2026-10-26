import React from 'react';

type PageShellProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
};

/** Frame for new Dominion pages. Vehicle Catalog and World Maps stay as they are. */
export function PageShell({ title, description, action, children }: PageShellProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
