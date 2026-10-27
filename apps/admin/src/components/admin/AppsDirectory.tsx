// Stitch: dominion-redesign/89e9776a37054ae494498050fa6f5721
import React, { useEffect, useState } from 'react';
import { Boxes, ChevronRight, Info } from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { DominionRecordDrawer } from './DominionRecordDrawer';

const APPS: { name: string; site: string; admin: string; datasets: string }[] = [
  { name: 'Roam Plug', site: 'https://roamplug.app', admin: 'https://roamplug.app', datasets: 'Stations, places, tolls' },
  { name: 'Roam Fleet', site: 'https://roamfleet.co', admin: 'https://roamfleet.co/admin', datasets: 'Stations, vehicles, tolls' },
  { name: 'Roam Driver', site: 'https://roamdriver.co', admin: 'https://roamdriver.co/admin', datasets: 'Vehicles, stations' },
  { name: 'Roam Rides', site: 'https://roam-s.co', admin: 'https://roam-s.co/admin', datasets: 'Tolls, places' },
  { name: 'Roam Rush', site: 'https://roamrush.app', admin: 'https://roamrush.app/admin', datasets: 'Places' },
  { name: 'Roam Haul', site: 'https://roamhaul.co', admin: 'https://roamhaul.co/admin', datasets: 'Places' },
  { name: 'Roam Enterprise', site: 'https://roamenterprise.co', admin: 'https://roamenterprise.co/admin', datasets: 'Vendors, tax rates' },
];

type AppRow = {
  name: string;
  site: string;
  admin: string;
  datasets: string;
  syncAt: string | null;
};

function shortAppName(name: string): string {
  return name.replace(/^Roam\s+/i, '');
}

export function AppsDirectory() {
  const { session } = useAuth();
  const [rows, setRows] = useState<AppRow[]>(
    APPS.map((app) => ({ ...app, syncAt: null })),
  );
  const [failed, setFailed] = useState(false);
  const [openName, setOpenName] = useState<string | null>(null);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    void fetch(`${API_ENDPOINTS.catalog}/admin/consumers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('apps');
        return res.json() as Promise<{
          consumers?: {
            name: string;
            site?: string;
            admin_url?: string;
            datasets?: string[];
            last_sync_at?: string | null;
          }[];
        }>;
      })
      .then((body) => {
        if (cancelled || !body.consumers?.length) return;
        setFailed(false);
        setRows(
          body.consumers.map((app) => ({
            name: app.name,
            site: app.site || '',
            admin: app.admin_url || app.site || '',
            datasets: (app.datasets || []).join(', '),
            syncAt: app.last_sync_at || null,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const open = rows.find((app) => app.name === openName) ?? null;
  const connectedCount = rows.length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-0 p-8 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-400">/</span>
          <span>Distribution</span>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-900">Apps</span>
        </nav>
        <div className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          <span>REGION: JM-KGN</span>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Apps</h1>
        <p className="mt-1 text-sm text-slate-500">The Roam apps that read published data.</p>
      </div>

      {failed ? (
        <p className="mb-4 text-sm text-slate-500">
          Couldn’t load the live list — showing the directory we already know.
        </p>
      ) : null}

      <div className="mb-6 flex items-center justify-between rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600">
            <Boxes className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-800">Consumer App Distribution Nodes</span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {connectedCount > 0 ? `${connectedCount} Connected` : '—'}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-400">
              Partition: Kingston & St. Andrew (JM-01) • Highway 2000 Corridor
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">CURRENCY: JMD</span>
          <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">LOC: KINGSTON</span>
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-slate-400" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-800">
              Registered Client Applications
            </h2>
          </div>
          <div className="font-mono text-[11px] text-slate-400">DOMAIN_ZONE: ROAM_DIST_JM</div>
        </div>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/75 font-mono text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <th scope="col" className="px-5 py-3">App</th>
              <th scope="col" className="px-5 py-3">Site</th>
              <th scope="col" className="px-5 py-3">Reads</th>
              <th scope="col" className="px-5 py-3">Last sync</th>
              <th scope="col" className="px-5 py-3 text-right font-sans">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500">
                  The data is not in yet.
                </td>
              </tr>
            ) : (
              rows.map((app) => {
                const selected = openName === app.name;
                const synced = Boolean(app.syncAt);
                return (
                  <tr
                    key={app.name}
                    className={
                      selected
                        ? 'bg-blue-50/40 transition-colors hover:bg-blue-50/60'
                        : 'transition-colors hover:bg-slate-50/70'
                    }
                  >
                    <td className={`px-5 py-3.5 font-semibold ${selected ? 'text-slate-900' : 'text-slate-800'}`}>
                      <span className="inline-flex items-center gap-2.5">
                        <span
                          className={`h-2 w-2 rounded-full ${selected ? 'bg-blue-600' : 'bg-slate-300'}`}
                          aria-hidden
                        />
                        <span>{shortAppName(app.name)}</span>
                        {selected ? (
                          <span className="ml-1 rounded border border-blue-200/60 bg-blue-100/60 px-1.5 py-0.5 font-mono text-[10px] text-blue-600">
                            SELECTED
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-blue-600">
                      {app.site ? (
                        <a
                          href={app.admin || app.site}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {app.site}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-600">{app.datasets || '—'}</td>
                    <td className="px-5 py-3.5 font-mono text-slate-400">
                      {synced ? (
                        new Date(app.syncAt!).toLocaleString()
                      ) : (
                        <span className="italic">The data is not in yet</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {selected ? (
                        <button
                          type="button"
                          onClick={() => setOpenName(app.name)}
                          className="rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-blue-600 shadow-xs"
                        >
                          Drawer open
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenName(app.name)}
                          className="rounded p-1 text-slate-400 hover:text-slate-600"
                          aria-label={`Inspect ${app.name}`}
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
        <div className="flex items-center gap-2.5 font-mono italic text-slate-400">
          <Info className="h-4 w-4 shrink-0 not-italic text-slate-400" aria-hidden />
          <span>The data is not in yet.</span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">LOC: KINGSTON / PARISH REGISTRY JMD</div>
      </div>

      <DominionRecordDrawer
        title={open?.name || 'App'}
        recordId={open?.name}
        open={Boolean(open)}
        onClose={() => setOpenName(null)}
      >
        {open && (
          <div className="space-y-3 text-sm text-[#0f172a]">
            <p>Site: {open.site || '—'}</p>
            <p>Reads: {open.datasets || '—'}</p>
            <p>
              Last sync:{' '}
              {open.syncAt ? new Date(open.syncAt).toLocaleString() : 'The data is not in yet'}
            </p>
          </div>
        )}
      </DominionRecordDrawer>
    </div>
  );
}
