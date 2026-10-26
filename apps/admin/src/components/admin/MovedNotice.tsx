import React from 'react';

type MovedNoticeProps = {
  title: string;
  appName: string;
  href: string;
};

/** Shown for 30 days after a screen moves to a product admin. */
export function MovedNotice({ title, appName, href }: MovedNoticeProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900/40">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        This now lives in {appName}.
      </p>
      <a
        href={href}
        className="mt-4 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
      >
        Open
      </a>
    </div>
  );
}
