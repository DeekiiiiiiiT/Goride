/** Shared Tailwind class strings — always pair light defaults with dark: variants. */
export const adminSurfaces = {
  pageTitle: 'text-xl font-bold text-slate-900 dark:text-white',
  pageSubtitle: 'text-sm text-slate-600 dark:text-slate-400',
  sectionTitle: 'text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider',
  card: 'bg-white border border-slate-200 rounded-xl dark:bg-slate-900 dark:border-slate-800',
  cardMuted: 'bg-white border border-slate-200 rounded-xl dark:bg-slate-900/50 dark:border-slate-800',
  panel: 'bg-white border border-slate-200 rounded-lg dark:bg-slate-900 dark:border-slate-800',
  panelMuted: 'bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-900/40 dark:border-slate-800',
  statCard:
    'bg-white border border-slate-200 rounded-xl p-5 text-left hover:border-slate-300 hover:shadow-sm dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-700 transition-colors',
  input:
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 dark:bg-slate-900 dark:border-slate-800 dark:text-white dark:placeholder:text-slate-500',
  select:
    'appearance-none px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300',
  tableWrap: 'bg-white border border-slate-200 rounded-xl overflow-hidden dark:bg-slate-900 dark:border-slate-800',
  tableHead: 'bg-slate-50 border-b border-slate-200 dark:bg-slate-900/90 dark:border-slate-800',
  tableHeadCell: 'text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400',
  tableRow: 'border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50',
  tableCell: 'text-sm text-slate-700 dark:text-slate-300',
  tableCellStrong: 'text-sm font-medium text-slate-900 dark:text-white',
  paginationBar:
    'flex flex-col sm:flex-row items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 gap-3 dark:bg-slate-900 dark:border-slate-800',
  modal:
    'bg-white border border-slate-200 rounded-xl shadow-2xl dark:bg-slate-900 dark:border-slate-700',
  tabsList: 'bg-slate-100 border border-slate-200 p-1 dark:bg-slate-900 dark:border-slate-800',
  label: 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5',
  muted: 'text-xs text-slate-500',
  iconBtn:
    'inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg transition-colors dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-300',
} as const;
