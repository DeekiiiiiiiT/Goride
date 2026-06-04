import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Loader2, Upload } from 'lucide-react';
import {
  buildDataSafetySchema,
  buildStoreListingPreview,
  validateDataSafetyState,
} from '../dataSafety';
import type { DataSafetyImportDiffPayload, DataSafetyRowsPayload } from '../types';
import type { DataSafetyState, DataSafetyValidationIssue } from '../dataSafety/types';
import { DataSafetyStorePreview } from './DataSafetyStorePreview';
import { DataSafetyTypeModal } from './DataSafetyTypeModal';
import { DataSafetyQuestionField } from './DataSafetyQuestionField';
import {
  setCheckboxValue,
  setRadioValue,
  setTextValue,
  updateRowValue,
} from '../dataSafety/csv';

export interface DataSafetyPanelProps {
  rowsPayload: DataSafetyRowsPayload | null;
  privacyPolicyUrl: string;
  templateUrl?: string;
  templateLoadLabel?: string;
  templateVersion?: string;
  importedAt: string | null;
  updatedAt: string | null;
  canEdit: boolean;
  saving: boolean;
  intro?: string;
  onImportCsv: (csv: string, dryRun?: boolean) => Promise<{
    diff?: DataSafetyImportDiffPayload;
    issues?: DataSafetyValidationIssue[];
  }>;
  onExportCsv: () => Promise<void>;
  onSaveRows: (state: DataSafetyState, expectedUpdatedAt?: string | null) => Promise<void>;
  notes: string;
  onSaveNotes: (notes: string) => Promise<void>;
}

function rowsToState(payload: DataSafetyRowsPayload | null): DataSafetyState | null {
  if (!payload?.rows?.length) return null;
  return {
    rows: payload.rows,
    templateVersion: payload.templateVersion ?? undefined,
  };
}

export function DataSafetyPanel({
  rowsPayload,
  privacyPolicyUrl,
  templateUrl,
  templateLoadLabel = 'Load template',
  templateVersion,
  importedAt,
  updatedAt,
  canEdit,
  saving,
  intro,
  onImportCsv,
  onExportCsv,
  onSaveRows,
  notes,
  onSaveNotes,
}: DataSafetyPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localState, setLocalState] = useState<DataSafetyState | null>(() => rowsToState(rowsPayload));
  const [dirty, setDirty] = useState(false);
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState(notes);
  const [importPreview, setImportPreview] = useState<{
    csv: string;
    diff: DataSafetyImportDiffPayload;
  } | null>(null);
  const [issues, setIssues] = useState<DataSafetyValidationIssue[]>([]);

  React.useEffect(() => {
    setLocalState(rowsToState(rowsPayload));
    setDirty(false);
  }, [rowsPayload]);

  React.useEffect(() => {
    setNotesDraft(notes);
  }, [notes]);

  const schema = useMemo(
    () => (localState ? buildDataSafetySchema(localState) : null),
    [localState],
  );

  const preview = useMemo(
    () => (localState ? buildStoreListingPreview(localState, privacyPolicyUrl) : null),
    [localState, privacyPolicyUrl],
  );

  const handleStateChange = useCallback((next: DataSafetyState) => {
    setLocalState(next);
    setDirty(true);
    setIssues(validateDataSafetyState(next));
  }, []);

  const handleQuestionChange = (question: import('../dataSafety/types').DataSafetySchemaQuestion, value: unknown) => {
    if (!localState) return;
    if (question.kind === 'checkbox' && typeof value === 'object' && value !== null) {
      const { responseId, checked } = value as { responseId: string; checked: boolean };
      handleStateChange(setCheckboxValue(localState, question.questionId, responseId, checked));
      return;
    }
    if (question.kind === 'radio' && typeof value === 'string') {
      handleStateChange(setRadioValue(localState, question.questionId, value));
      return;
    }
    if (question.kind === 'ephemeral' && typeof value === 'boolean') {
      handleStateChange(updateRowValue(localState, question.questionId, '', value ? 'true' : 'false'));
      return;
    }
    if (typeof value === 'string') {
      handleStateChange(setTextValue(localState, question.questionId, value));
    }
  };

  const handleFileSelect = async (file: File) => {
    const csv = await file.text();
    const result = await onImportCsv(csv, true);
    if (result.diff) {
      setImportPreview({ csv, diff: result.diff });
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    await onImportCsv(importPreview.csv, false);
    setImportPreview(null);
    setDirty(false);
  };

  const loadTemplate = async () => {
    if (!templateUrl) return;
    const res = await fetch(templateUrl);
    const csv = await res.text();
    await onImportCsv(csv, false);
  };

  const activeUsage = schema?.typeUsages.find((t) => t.typeId === activeTypeId);

  return (
    <div className="rounded-xl border border-slate-700 bg-white text-slate-900 shadow-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Data safety</h3>
          {intro && <p className="mt-0.5 text-sm text-slate-600 max-w-2xl">{intro}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileSelect(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Import from CSV
              </button>
            </>
          )}
          <button
            type="button"
            disabled={saving || !localState}
            onClick={() => void onExportCsv()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export to CSV
          </button>
        </div>
      </div>

      {(importedAt || updatedAt || templateVersion) && (
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-2 text-xs text-slate-500">
          {importedAt && <span>Last imported: {new Date(importedAt).toLocaleString()}</span>}
          {importedAt && updatedAt && <span className="mx-2">·</span>}
          {updatedAt && <span>Last saved: {new Date(updatedAt).toLocaleString()}</span>}
          {templateVersion && (
            <>
              {(importedAt || updatedAt) && <span className="mx-2">·</span>}
              <span>Template: {templateVersion}</span>
            </>
          )}
        </div>
      )}

      {importPreview && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-amber-900">Review import changes</p>
              <p className="mt-1 text-amber-800">
                {importPreview.diff.changedRows} changed, {importPreview.diff.addedRows} added,{' '}
                {importPreview.diff.removedRows} removed rows.
              </p>
              {importPreview.diff.criticalChanges.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-amber-800">
                  {importPreview.diff.criticalChanges.slice(0, 5).map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void confirmImport()}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Apply import
                </button>
                <button
                  type="button"
                  onClick={() => setImportPreview(null)}
                  className="rounded-lg px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!localState ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm text-slate-600">
            No data safety answers loaded yet. Import your Google Play Console export CSV, or load the
            Rider template to get started.
          </p>
          {canEdit && templateUrl && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void loadTemplate()}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Load {templateLoadLabel}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-0 lg:grid-cols-2">
          <div className="border-b lg:border-b-0 lg:border-r border-slate-200 px-5 py-5">
            {preview && <DataSafetyStorePreview preview={preview} />}
          </div>

          <div className="px-5 py-5 max-h-[70vh] overflow-y-auto">
            <h4 className="text-sm font-semibold text-slate-900 mb-4">Questionnaire</h4>

            {schema?.overview.map((section) => (
              <div key={section.id} className="mb-6">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  {section.title}
                </h5>
                <div className="space-y-5">
                  {section.questions.map((q) => (
                    <DataSafetyQuestionField
                      key={q.questionId}
                      question={q}
                      onChange={(value) => handleQuestionChange(q, value)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {schema?.dataTypes.map((section) => (
              <div key={section.id} className="mb-6">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  {section.title}
                </h5>
                <div className="space-y-5">
                  {section.questions.map((q) => (
                    <DataSafetyQuestionField
                      key={q.questionId}
                      question={q}
                      onChange={(value) => handleQuestionChange(q, value)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {schema && schema.typeUsages.length > 0 && (
              <div className="mb-6">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Data usage and handling
                </h5>
                <ul className="space-y-2">
                  {schema.typeUsages.map((usage) => (
                    <li key={usage.typeId}>
                      <button
                        type="button"
                        onClick={() => setActiveTypeId(usage.typeId)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-800 hover:border-blue-300 hover:bg-blue-50/50"
                      >
                        <span className="text-slate-500">{usage.category} / </span>
                        {usage.typeLabel}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {issues.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-medium text-amber-900">Validation</p>
                <ul className="mt-1 list-disc pl-5 text-amber-800">
                  {issues.map((i) => (
                    <li key={`${i.code}-${i.message}`}>{i.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 space-y-3">
        {canEdit && localState && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void onSaveRows(localState, updatedAt)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </button>
            {dirty && (
              <span className="text-sm text-amber-700">Unsaved changes — export only after saving.</span>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700">Your notes</label>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            readOnly={!canEdit}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
            placeholder="e.g. last reviewed Jun 2026"
          />
          {canEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void onSaveNotes(notesDraft)}
              className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Save notes
            </button>
          )}
        </div>
      </div>

      {activeUsage && localState && (
        <DataSafetyTypeModal
          typeLabel={activeUsage.typeLabel}
          category={activeUsage.category}
          questions={activeUsage.usageQuestions}
          state={localState}
          onChange={handleStateChange}
          onClose={() => setActiveTypeId(null)}
        />
      )}
    </div>
  );
}
