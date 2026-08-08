import { useEffect, useMemo, useState } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import { useAuth } from '@/app/auth/AuthProvider';
import { useDeleteOrgFile, useOrgFiles } from '@/app/hooks/useFreight';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import { freightService } from '@/app/services/freightService';

const KIND_OPTIONS = [
  { value: '', label: 'All kinds' },
  { value: 'pod', label: 'POD' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'bol', label: 'BOL' },
  { value: 'customs', label: 'Customs' },
  { value: 'packing_list', label: 'Packing list' },
  { value: 'other', label: 'Other' },
] as const;

function formatBytes(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: unknown): string {
  if (!iso || typeof iso !== 'string') return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function kindLabel(kind: unknown): string {
  const k = String(kind || '');
  return KIND_OPTIONS.find((o) => o.value === k)?.label || k || '—';
}

function linkedLabel(row: Record<string, unknown>): string {
  const t = row.source_type ? String(row.source_type) : '';
  const id = row.source_id ? String(row.source_id) : '';
  if (!t && !id) return '—';
  if (t && id) return `${t.replace(/_/g, ' ')} · ${id.slice(0, 8)}`;
  return t || id.slice(0, 8);
}

/**
 * Company Files library — photos/PDFs uploaded across freight ops.
 * CSV imports (Suites/Manifests) become data rows, not Files entries.
 */
export function FilesPage() {
  const { organizationId } = useAuth();
  const { seatRole } = useSeatAccess();
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { data, isLoading, error } = useOrgFiles({
    kind: kind || undefined,
    q: search || undefined,
  });
  const remove = useDeleteOrgFile();

  const files = useMemo(() => data?.files ?? [], [data?.files]);
  const canDelete = Boolean(data?.canDelete) || seatRole === 'enterprise_owner';

  useEffect(() => {
    if (!deleteRow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeleteRow(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteRow]);

  async function onPreview(row: Record<string, unknown>) {
    setPreviewError(null);
    try {
      const res = await freightService.orgFileUrl(String(row.id), organizationId);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setPreviewError((e as Error).message);
    }
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(String(deleteRow.id));
      setDeleteRow(null);
    } catch (e) {
      setDeleteError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Files</h1>
        <p className="mt-1 text-sm text-slate-500">
          Photos and PDFs uploaded by your team (POD, invoices, customs docs). Spreadsheet CSV
          imports stay on Suites and Manifests as records — not here.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm text-slate-600">
          Search file name
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSearch(q.trim());
            }}
            placeholder="invoice, pod…"
            className="mt-1 w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm text-slate-600">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setSearch(q.trim())}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          Search
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}
      {previewError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {previewError}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium">Kind</th>
              <th className="px-4 py-3 font-medium">Linked to</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Uploaded</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading files…
                </td>
              </tr>
            )}
            {!isLoading && files.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No uploaded files yet. POD photos and document uploads will show up here.
                </td>
              </tr>
            )}
            {files.map((row) => (
              <tr key={String(row.id)} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {String(row.file_name || '—')}
                  <p className="mt-0.5 text-xs font-normal text-slate-400">
                    {String(row.content_type || '')}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-600">{kindLabel(row.kind)}</td>
                <td className="px-4 py-3 text-slate-600">{linkedLabel(row)}</td>
                <td className="px-4 py-3 text-slate-600">{formatBytes(row.byte_size)}</td>
                <td className="px-4 py-3 text-slate-600">{formatWhen(row.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      title="Preview"
                      onClick={() => void onPreview(row)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteRow(row);
                        }}
                        className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
          >
            <h2 className="text-lg font-semibold">Delete file?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This permanently removes{' '}
              <span className="font-medium text-slate-900">
                {String(deleteRow.file_name)}
              </span>{' '}
              from storage. Linked POD photos on deliveries will be cleared.
            </p>
            {deleteError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => setDeleteRow(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => void confirmDelete()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {remove.isPending ? 'Deleting…' : 'Delete file'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
