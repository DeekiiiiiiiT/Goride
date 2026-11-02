type Props = {
  page: number;
  pageCount: number;
  setPage: (n: number) => void;
  className?: string;
};

export function InventoryPagination({ page, pageCount, setPage, className = '' }: Props) {
  const atStart = page <= 0;
  const atEnd = page >= pageCount - 1;
  const pages = Array.from({ length: pageCount }, (_, i) => i);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        disabled={atStart}
        className="px-space-md py-1 rounded bg-surface-container text-secondary text-caption font-semibold disabled:opacity-50"
        onClick={() => setPage(Math.max(0, page - 1))}
      >
        Previous
      </button>
      {pages.map((n) => (
        <button
          key={n}
          type="button"
          className={`min-w-[2rem] px-2 py-1 rounded text-caption font-semibold ${
            n === page
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container text-secondary hover:text-on-surface'
          }`}
          onClick={() => setPage(n)}
        >
          {n + 1}
        </button>
      ))}
      <button
        type="button"
        disabled={atEnd}
        className="px-space-md py-1 rounded bg-surface-container text-secondary text-caption font-semibold disabled:opacity-50"
        onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
      >
        Next
      </button>
    </div>
  );
}
