import React, { useCallback, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  MinusCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { PLAY_STORE_GROUP_LABELS } from '../catalogGroups';
import type {
  DataSafetyImportDiffPayload,
  DataSafetyRowsPayload,
  PlayStoreChecklistPatch,
  PlayStoreChecklistStatus,
  PlayStoreLaunchPayload,
  PlayStoreReleaseInput,
} from '../types';
import type { DataSafetyState, DataSafetyValidationIssue } from '../dataSafety/types';
import { DataSafetyPanel } from './DataSafetyPanel';

type TabId = 'checklist' | 'releases' | 'data_safety';

export interface PlayStoreLaunchPageProps {
  data: PlayStoreLaunchPayload | null;
  dataSafetyTemplateUrl?: string;
  dataSafetyIntro?: string;
  loading: boolean;
  canEdit: boolean;
  saving: boolean;
  onRefresh: () => void;
  onPatchChecklist: (patches: PlayStoreChecklistPatch[]) => Promise<void>;
  onSaveDataSafetyNotes: (notes: string) => Promise<void>;
  onImportDataSafetyCsv: (
    csv: string,
    dryRun?: boolean,
  ) => Promise<{ diff?: DataSafetyImportDiffPayload; issues?: DataSafetyValidationIssue[] }>;
  onExportDataSafetyCsv: () => Promise<void>;
  onSaveDataSafetyRows: (
    state: DataSafetyState,
    expectedUpdatedAt?: string | null,
  ) => Promise<void>;
  onAddRelease: (input: PlayStoreReleaseInput) => Promise<void>;
  onDeleteRelease: (id: string) => Promise<void>;
}

function StatusIcon({ status }: { status: PlayStoreChecklistStatus }) {
  if (status === 'done') return <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />;
  if (status === 'na') return <MinusCircle className="h-5 w-5 text-slate-500 shrink-0" />;
  return <Circle className="h-5 w-5 text-slate-600 shrink-0" />;
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function PlayStoreLaunchPage({
  data,
  dataSafetyTemplateUrl,
  dataSafetyIntro,
  loading,
  canEdit,
  saving,
  onRefresh,
  onPatchChecklist,
  onSaveDataSafetyNotes,
  onImportDataSafetyCsv,
  onExportDataSafetyCsv,
  onSaveDataSafetyRows,
  onAddRelease,
  onDeleteRelease,
}: PlayStoreLaunchPageProps) {
  const [tab, setTab] = useState<TabId>('checklist');
  const [releaseForm, setReleaseForm] = useState<PlayStoreReleaseInput>({
    version_name: '',
    version_code: 1,
    track: 'closed',
    uploaded_at: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  React.useEffect(() => {
    if (data?.meta) {
      setReleaseForm((f) => ({
        ...f,
        version_name: data.meta.repoVersionName,
        version_code: data.meta.repoVersionCode,
      }));
    }
  }, [data?.meta.repoVersionName, data?.meta.repoVersionCode]);

  const groupedCatalog = useMemo(() => {
    if (!data) return [];
    const groups = ['app_content', 'store_listing', 'testing_release'] as const;
    return groups.map((group) => ({
      group,
      label: PLAY_STORE_GROUP_LABELS[group],
      items: data.catalog.filter((i) => i.group === group),
    }));
  }, [data]);

  const setItemStatus = useCallback(
    async (itemId: string, status: PlayStoreChecklistStatus) => {
      const existing = data?.checklist[itemId];
      await onPatchChecklist([
        {
          itemId,
          status,
          notes: existing?.notes,
        },
      ]);
    },
    [data?.checklist, onPatchChecklist],
  );

  const setItemNotes = useCallback(
    async (itemId: string, notes: string) => {
      const existing = data?.checklist[itemId];
      await onPatchChecklist([
        {
          itemId,
          status: existing?.status ?? 'todo',
          notes,
        },
      ]);
    },
    [data?.checklist, onPatchChecklist],
  );

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-slate-400">
        Could not load Play Store tracker. Check rides admin API and migrations.
      </p>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'checklist', label: 'Checklist' },
    { id: 'releases', label: 'Releases' },
    { id: 'data_safety', label: 'Data safety' },
  ];

  return (
    <div className="space-y-6 text-slate-200">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        This page tracks your Play Console work. You must still complete each step in{' '}
        <a
          href={data.meta.playConsoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline hover:text-white"
        >
          Google Play Console
        </a>
        .
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Play Store — {data.meta.productLabel}</h2>
          <p className="mt-1 text-sm text-slate-400 font-mono">{data.meta.packageId}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-emerald-400">{data.progress.percent}%</p>
          <p className="text-xs text-slate-500">
            {data.progress.done} / {data.progress.total} required tasks
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-slate-500 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {tab === 'checklist' && (
        <div className="space-y-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Privacy URL</p>
              <p className="mt-1 text-sm break-all">{data.meta.privacyPolicyUrl}</p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                onClick={() => void copyText(data.meta.privacyPolicyUrl)}
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Reviewer login</p>
              <p className="mt-1 text-sm font-mono">{data.meta.reviewerEmail}</p>
              <p className="text-sm font-mono text-slate-400">{data.meta.reviewerPassword}</p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                onClick={() =>
                  void copyText(
                    `Email: ${data.meta.reviewerEmail}\nPassword: ${data.meta.reviewerPassword}\nSteps: ${data.meta.reviewerSteps}`,
                  )
                }
              >
                <Copy className="h-3.5 w-3.5" /> Copy for App access
              </button>
            </div>
          </div>

          <a
            href={data.meta.playConsoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <ExternalLink className="h-4 w-4" />
            Open Play Console
          </a>

          {groupedCatalog.map(({ group, label, items }) => (
            <section key={group}>
              <h3 className="mb-3 text-sm font-semibold text-slate-300">{label}</h3>
              <ul className="space-y-3">
                {items.map((item) => {
                  const state = data.checklist[item.id] ?? { status: 'todo' as const };
                  return (
                    <li
                      key={item.id}
                      className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <StatusIcon status={state.status} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-white">
                            {item.label}
                            {item.optional && (
                              <span className="ml-2 text-xs font-normal text-slate-500">(optional)</span>
                            )}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{item.playConsoleHint}</p>
                        </div>
                        {canEdit && (
                          <div className="flex flex-wrap gap-1">
                            {(['todo', 'done', 'na'] as const).map((s) => (
                              <button
                                key={s}
                                type="button"
                                disabled={saving}
                                onClick={() => void setItemStatus(item.id, s)}
                                className={`rounded px-2 py-1 text-xs capitalize ${
                                  state.status === s
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {s === 'na' ? 'N/A' : s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        key={`${item.id}-${state.notes ?? ''}`}
                        defaultValue={state.notes ?? ''}
                        onBlur={(e) => {
                          if (canEdit && e.target.value !== (state.notes ?? '')) {
                            void setItemNotes(item.id, e.target.value);
                          }
                        }}
                        readOnly={!canEdit}
                        placeholder="Notes (optional)"
                        className="mt-3 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 disabled:opacity-60"
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {tab === 'releases' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-slate-500">
                    <th className="px-4 py-3 font-medium">Version</th>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Track</th>
                    <th className="px-4 py-3 font-medium">Uploaded</th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {data.releases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No releases logged yet.
                      </td>
                    </tr>
                  ) : (
                    data.releases.map((r) => (
                      <tr key={r.id} className="border-b border-slate-800/80">
                        <td className="px-4 py-3 font-mono">{r.version_name}</td>
                        <td className="px-4 py-3 tabular-nums">{r.version_code}</td>
                        <td className="px-4 py-3 capitalize">{r.track}</td>
                        <td className="px-4 py-3">{r.uploaded_at}</td>
                        <td className="px-4 py-3 text-slate-400 max-w-[12rem] truncate">
                          {r.notes ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          {canEdit && (
                            <button
                              type="button"
                              title="Remove"
                              disabled={saving}
                              onClick={() => void onDeleteRelease(r.id)}
                              className="text-slate-500 hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-xs font-medium text-emerald-400/80 uppercase">Repo build (suggested)</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {data.meta.repoVersionName}{' '}
                <span className="text-slate-400 font-normal">({data.meta.repoVersionCode})</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                From android/app/build.gradle — bump before each new AAB.
              </p>
            </div>

            {canEdit && (
              <form
                className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void onAddRelease(releaseForm).then(() => {
                    setReleaseForm((f) => ({ ...f, notes: '' }));
                  });
                }}
              >
                <p className="text-sm font-medium text-white">Log upload</p>
                <label className="block text-xs text-slate-500">
                  Version name
                  <input
                    required
                    value={releaseForm.version_name}
                    onChange={(e) =>
                      setReleaseForm((f) => ({ ...f, version_name: e.target.value }))
                    }
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Version code
                  <input
                    required
                    type="number"
                    min={1}
                    value={releaseForm.version_code}
                    onChange={(e) =>
                      setReleaseForm((f) => ({
                        ...f,
                        version_code: Number(e.target.value) || 1,
                      }))
                    }
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Track
                  <select
                    value={releaseForm.track}
                    onChange={(e) =>
                      setReleaseForm((f) => ({
                        ...f,
                        track: e.target.value as PlayStoreReleaseInput['track'],
                      }))
                    }
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="internal">Internal</option>
                    <option value="closed">Closed</option>
                    <option value="open">Open</option>
                    <option value="production">Production</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-500">
                  Uploaded date
                  <input
                    required
                    type="date"
                    value={releaseForm.uploaded_at}
                    onChange={(e) =>
                      setReleaseForm((f) => ({ ...f, uploaded_at: e.target.value }))
                    }
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Notes
                  <input
                    value={releaseForm.notes ?? ''}
                    onChange={(e) => setReleaseForm((f) => ({ ...f, notes: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Add release
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {tab === 'data_safety' && (
        <DataSafetyPanel
          rowsPayload={data.data_safety_rows}
          privacyPolicyUrl={data.meta.privacyPolicyUrl}
          templateUrl={dataSafetyTemplateUrl}
          templateLoadLabel={dataSafetyTemplateUrl?.includes('driver') ? 'Driver template' : 'Rides template'}
          templateVersion={data.data_safety_template_version ?? undefined}
          importedAt={data.data_safety_imported_at}
          updatedAt={data.updated_at}
          canEdit={canEdit}
          saving={saving}
          intro={dataSafetyIntro}
          onImportCsv={onImportDataSafetyCsv}
          onExportCsv={onExportDataSafetyCsv}
          onSaveRows={onSaveDataSafetyRows}
          notes={data.data_safety_notes ?? ''}
          onSaveNotes={onSaveDataSafetyNotes}
        />
      )}

      {!canEdit && (
        <p className="text-xs text-amber-500/90">Read-only — product admin role required to save.</p>
      )}
    </div>
  );
}
