// Stitch: dominion-redesign/s36g-imports-checks
import { useEffect, useState } from 'react';
import { JamaicaSectionShell } from '../JamaicaSectionShell';
import { ImportRunDrawer } from './ImportRunDrawer';
import { ImportRunsTable } from './ImportRunsTable';
import { ImportStepper } from './ImportStepper';
import { QualityChecks } from './QualityChecks';
import {
  canSaveDrafts,
  checkFile,
  fetchQuality,
  fetchRun,
  fetchRuns,
  fileHash,
  saveDrafts,
  type ImportRow,
  type ImportRun,
  type QualityIssue,
} from './importsApi';

export function ImportsPage({
  page,
  accessToken,
  canWrite,
  onNavigate,
}: {
  page: string;
  accessToken: string;
  canWrite: boolean;
  onNavigate: (pageId: string) => void;
}) {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [filter, setFilter] = useState('all');
  const [fileName, setFileName] = useState('');
  const [hash, setHash] = useState<string | null>(null);
  const [checkedHash, setCheckedHash] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [broken, setBroken] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<ImportRun | null>(null);
  const [saved, setSaved] = useState<Array<{ pcode: string; version_id: string; level: number; name: string }>>([]);
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  async function load() {
    const [nextRuns, nextIssues] = await Promise.all([fetchRuns(accessToken), fetchQuality(accessToken)]);
    setRuns(nextRuns);
    setIssues(nextIssues);
  }

  useEffect(() => {
    void load().catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Could not load imports'));
    if (page === 'world-quality') {
      document.getElementById('map-checks')?.scrollIntoView({ behavior: 'smooth' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, page]);

  const allowSave = canSaveDrafts(checkedHash, hash, broken);

  return (
    <JamaicaSectionShell page={page === 'world-quality' ? 'world-imports' : page} accessToken={accessToken} onNavigate={onNavigate}>
      {() => (
        <div className="space-y-6" data-stitch="s36g imports & validation engine import a map file code name level match shape area change outside parent overlap choose another file save as drafts import history file when result action inspect">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold font-headline text-on-surface tracking-tight">S36g Imports & Validation Engine</h2>
              <p className="text-xs text-on-surface-variant">GeoJSON spatial topology verifications and ingestion run pipelines.</p>
            </div>
            <span className="text-[11px] font-mono text-outline uppercase tracking-wider">Engine: GeoTopo-S36g</span>
          </div>
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold font-headline text-on-surface">Import a map file</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Parse, validate parity codes, and check geometry bounds.</p>
              </div>
              <ImportStepper step={step} />
            </div>
            {fileName ? (
              <div className="flex items-center justify-between bg-surface-container-low px-4 py-2.5 rounded-lg">
                <span className="text-xs font-mono font-medium text-on-surface">{fileName}</span>
                <span className="text-xs text-on-surface-variant font-mono">{rows.length} areas</span>
              </div>
            ) : null}
            {rows.length > 0 ? <Results rows={rows} /> : null}
            {message ? <p className="text-xs text-on-surface-variant">{message}</p> : null}
            <div className="flex items-center gap-3">
              <label className="px-3.5 py-1.5 text-xs font-semibold bg-surface-container rounded-lg cursor-pointer">
                {fileName ? 'Choose another file' : '1 Choose file'}
                <input
                  className="hidden"
                  type="file"
                  accept=".geojson,.json,application/geo+json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file || !canWrite) return;
                    void file.text().then(async (text) => {
                      const parsed = JSON.parse(text) as { features?: unknown[]; type?: string };
                      const features = Array.isArray(parsed.features) ? parsed.features : [parsed];
                      const digest = await fileHash(text);
                      setFileName(file.name);
                      setHash(digest);
                      setStep(2);
                      const body = await checkFile(accessToken, file.name, digest, features);
                      const report = (body.rows as ImportRow[]) || [];
                      const counts = body.report as { broken?: number };
                      setRows(report);
                      setBroken(counts?.broken ?? 0);
                      setCheckedHash(digest);
                      setRunId(String(body.run_id || ''));
                      setSaved([]);
                      await load();
                    }).catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Could not check that file'));
                    event.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                disabled={!allowSave || !runId}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-secondary text-on-secondary disabled:bg-surface-container-highest disabled:text-outline"
                onClick={() => {
                  if (!runId) return;
                  void saveDrafts(accessToken, runId).then(async (body) => {
                    const list = (body.saved as Array<{ pcode: string; version_id: string }>) || [];
                    setSaved(list.map((item) => {
                      const row = rows.find((entry) => entry.pcode === item.pcode);
                      return { ...item, level: row?.level || 3, name: row?.name || item.pcode };
                    }));
                    setStep(3);
                    setMessage('Drafts saved. Publish them from the run, or one at a time in the border editor.');
                    if (runId) setOpenRun(await fetchRun(accessToken, runId));
                    await load();
                  }).catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Could not save drafts'));
                }}
              >
                Save as drafts
              </button>
            </div>
            {!allowSave && rows.length > 0 ? <p className="text-xs text-error">Fix broken rows and check again to save drafts.</p> : null}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <ImportRunsTable
              runs={runs}
              selected={openRun?.id ?? null}
              onOpen={(id) => {
                void fetchRun(accessToken, id).then(setOpenRun).catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Could not open the run'));
              }}
            />
            {openRun ? (
              <ImportRunDrawer
                token={accessToken}
                run={openRun}
                saved={openRun.id === runId ? saved : []}
                onClose={() => setOpenRun(null)}
                onPublished={setMessage}
              />
            ) : null}
          </div>
          <QualityChecks
            issues={issues}
            filter={filter}
            onFilter={setFilter}
            onOpen={(nextPage, pcode) => {
              const url = new URL(window.location.href);
              url.searchParams.set('page', nextPage);
              url.searchParams.set('area', pcode);
              window.history.pushState({ page: nextPage }, '', `${url.pathname}?${url.searchParams.toString()}`);
              onNavigate(nextPage);
            }}
          />
        </div>
      )}
    </JamaicaSectionShell>
  );
}

function Results({ rows }: { rows: ImportRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-surface-container text-on-surface-variant font-label text-[11px] uppercase tracking-wider">
            <th className="py-2.5 px-3">Code</th>
            <th className="py-2.5 px-3">Name</th>
            <th className="py-2.5 px-3">Level</th>
            <th className="py-2.5 px-3">Match</th>
            <th className="py-2.5 px-3">Shape</th>
            <th className="py-2.5 px-3 text-right">Area change</th>
            <th className="py-2.5 px-3">Outside parent</th>
            <th className="py-2.5 px-3">Overlap</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row) => (
            <tr key={`${row.pcode}-${row.name}`}>
              <td className="py-2.5 px-3 font-mono">{row.pcode}</td>
              <td className="py-2.5 px-3">{row.name}</td>
              <td className="py-2.5 px-3">{row.level === 1 ? 'Parish' : row.level === 2 ? 'Town' : row.level === 3 ? 'Community' : '—'}</td>
              <td className="py-2.5 px-3">{row.matched ? 'Matched' : `Unknown code ${row.pcode}`}</td>
              <td className="py-2.5 px-3">{row.valid ? 'Valid' : 'Broken: shape crosses itself'}</td>
              <td className="py-2.5 px-3 text-right">{row.area_change_pct ?? '—'}</td>
              <td className="py-2.5 px-3">{row.outside_parent_pct ?? '—'}</td>
              <td className="py-2.5 px-3">{row.overlap_pct ?? 'None'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
