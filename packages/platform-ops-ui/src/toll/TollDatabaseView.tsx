// Stitch: dominion-redesign/e1395d7f82344dcab17453c7d3a98f4d
import React, { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  ShieldCheck,
  List,
  RefreshCw,
  Database,
  Loader2,
  BookOpen,
  Link2,
  Plus,
} from 'lucide-react';
import { api } from '../services/tollOpsApi';
import { TollPlaza } from '@roam/types/toll';
import { TollPlazaList } from './TollPlazaList';
import { AddTollPlazaModal } from './AddTollPlazaModal';
import { VerifiedTollPlazasTab } from './VerifiedTollPlazasTab';
import { TollSpatialAuditMap } from './TollSpatialAuditMap';
import { TollPlazaDetailPanel } from './TollPlazaDetailPanel';
import { LearntTollPlazasTab } from './LearntTollPlazasTab';
import { TollPlazaAttributionDialog } from './TollPlazaAttributionDialog';
import { toast } from 'sonner';
import { ErrorBoundary } from '@roam/roam-shared';

type TollOpsTab = 'overview' | 'all-plazas' | 'spatial-audit' | 'verified-plazas' | 'learnt-plazas';

export function TollDatabaseView() {
  const [plazas, setPlazas] = useState<TollPlaza[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlaza, setSelectedPlaza] = useState<TollPlaza | null>(null);
  const [editingPlaza, setEditingPlaza] = useState<TollPlaza | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAttributionOpen, setIsAttributionOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TollOpsTab>('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTollPlazas();
      setPlazas(data);
    } catch (e) {
      console.error('[TollDatabase] Failed to load plazas:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeletePlaza = async (plaza: TollPlaza) => {
    if (!confirm(`Delete "${plaza.name}"? This action cannot be undone.`)) return;
    try {
      await api.deleteTollPlaza(plaza.id);
      toast.success(`"${plaza.name}" deleted successfully.`);
      await fetchData();
    } catch (e) {
      console.error('[TollDatabase] Delete failed:', e);
      toast.error(`Failed to delete "${plaza.name}".`);
    }
  };

  const handleUpdatePlaza = async (id: string, updates: Partial<TollPlaza>) => {
    const existing = plazas.find((p) => p.id === id);
    if (!existing) return;
    try {
      await api.saveTollPlaza({ ...existing, ...updates, updatedAt: new Date().toISOString() });
      await fetchData();
    } catch (e) {
      console.error('[TollDatabase] Update failed:', e);
      toast.error('Failed to update toll plaza.');
      throw e;
    }
  };

  const handlePromotePlaza = async (plaza: TollPlaza) => {
    try {
      await handleUpdatePlaza(plaza.id, { status: 'verified' });
      toast.success(`"${plaza.name}" promoted to Master Verified Ledger.`);
    } catch {
      /* toast already shown */
    }
  };

  const handleDemotePlaza = async (id: string) => {
    const plaza = plazas.find((p) => p.id === id);
    try {
      await handleUpdatePlaza(id, { status: 'unverified' });
      toast.success(`"${plaza?.name || 'Plaza'}" demoted to unverified.`);
    } catch {
      /* toast already shown */
    }
  };

  const handleMergeLearnt = async (learntPlaza: TollPlaza, targetPlaza: TollPlaza) => {
    try {
      await api.deleteTollPlaza(learntPlaza.id);
      const updates: Partial<TollPlaza> = {};
      if (!targetPlaza.address && learntPlaza.address) updates.address = learntPlaza.address;
      if (!targetPlaza.parish && learntPlaza.parish) updates.parish = learntPlaza.parish;
      if (Object.keys(updates).length > 0) {
        await handleUpdatePlaza(targetPlaza.id, updates);
      }
      await fetchData();
    } catch (e) {
      console.error('[TollDatabase] Merge failed:', e);
      toast.error('Failed to merge learnt plaza.');
      throw e;
    }
  };

  const handleDeletePlazaSilent = async (plaza: TollPlaza) => {
    try {
      await api.deleteTollPlaza(plaza.id);
      await fetchData();
    } catch (e) {
      console.error('[TollDatabase] Delete failed:', e);
      toast.error(`Failed to delete "${plaza.name}".`);
      throw e;
    }
  };

  const handleDeletePlazaById = async (id: string) => {
    const plaza = plazas.find((p) => p.id === id);
    try {
      await api.deleteTollPlaza(id);
      toast.success(`"${plaza?.name || 'Plaza'}" deleted successfully.`);
      setSelectedPlaza(null);
      await fetchData();
    } catch (e) {
      console.error('[TollDatabase] Delete failed:', e);
      toast.error(`Failed to delete "${plaza?.name || 'plaza'}".`);
    }
  };

  const handleEditFromPanel = (plaza: TollPlaza) => {
    setSelectedPlaza(null);
    setEditingPlaza(plaza);
    setIsAddModalOpen(true);
  };

  const verifiedCount = plazas.filter((p) => p.status === 'verified').length;
  const learntCount = plazas.filter((p) => p.status === 'learnt').length;

  const opsTabs: { id: TollOpsTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <Database className="h-3.5 w-3.5" /> },
    { id: 'all-plazas', label: 'All plazas', icon: <List className="h-3.5 w-3.5" />, count: plazas.length },
    { id: 'spatial-audit', label: 'Spatial', icon: <MapPin className="h-3.5 w-3.5" /> },
    {
      id: 'verified-plazas',
      label: 'Verified',
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
      count: verifiedCount,
    },
    { id: 'learnt-plazas', label: 'Learnt', icon: <BookOpen className="h-3.5 w-3.5" />, count: learntCount },
  ];

  return (
    <div className="max-w-6xl w-full space-y-6 animate-in fade-in p-8 duration-500">
      <div className="mb-4 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span aria-hidden>›</span>
          <span>Master data</span>
          <span aria-hidden>›</span>
          <span>Tolls</span>
          <span aria-hidden>›</span>
          <span className="font-semibold text-slate-900">Toll database</span>
        </nav>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          REGION: JM-KGN
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">Toll database</h1>
          <p className="mt-1 text-xs leading-normal text-slate-500">
            Plazas on Jamaican highways, and the class prices in JMD.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onClick={() => {
              setEditingPlaza(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#316bf3] px-3 py-1.5 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            Add Plaza
          </button>
          <button
            type="button"
            onClick={() => setIsAttributionOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
          >
            <Link2 className="h-4 w-4" />
            Fix Plaza Attribution
          </button>
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-[12px] border border-slate-200 bg-slate-50 p-1">
        {opsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? 'inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm'
                : 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white/70'
            }
          >
            {tab.icon}
            {tab.label}
            {tab.count != null && tab.count > 0 ? (
              <span className="rounded border border-slate-200 px-1 font-mono text-[10px] text-slate-500">
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <>
          <div className="overflow-hidden rounded-[12px] border border-slate-200/90 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">Plazas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-3.5">Name</th>
                    <th className="px-6 py-3.5">Highway</th>
                    <th className="px-6 py-3.5">Direction</th>
                    <th className="px-6 py-3.5">Parish</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                        Loading plazas…
                      </td>
                    </tr>
                  ) : plazas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center italic text-slate-400">
                        The data is not in yet.
                      </td>
                    </tr>
                  ) : (
                    plazas.slice(0, 12).map((plaza) => (
                      <tr
                        key={plaza.id}
                        className="cursor-pointer transition-colors hover:bg-slate-50/50"
                        onClick={() => setSelectedPlaza(plaza)}
                      >
                        <td className="px-6 py-4 font-medium text-slate-900">{plaza.name}</td>
                        <td className="px-6 py-4 text-slate-600">{plaza.highway || '—'}</td>
                        <td className="px-6 py-4 text-slate-600">{plaza.direction || '—'}</td>
                        <td className="px-6 py-4 text-slate-600">{plaza.parish || '—'}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {plaza.status === 'verified' ? 'Active' : plaza.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-slate-200/90 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">Rates</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-3.5">Plaza</th>
                    <th className="px-6 py-3.5">Class</th>
                    <th className="px-6 py-3.5">Price JMD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {(plazas.length === 0 ? [{ id: 'demo', name: 'Portmore' }] : plazas.slice(0, 1)).flatMap(
                    (plaza) =>
                      [1, 2, 3].map((cls) => (
                        <tr key={`${plaza.id}-c${cls}`} className="transition-colors hover:bg-slate-50/50">
                          <td className="px-6 py-4 font-medium text-slate-900">{plaza.name}</td>
                          <td className="px-6 py-4 font-medium text-slate-600">Class {cls}</td>
                          <td className="px-6 py-4 font-mono text-[11px] italic text-slate-400">
                            The data is not in yet.
                          </td>
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!loading && plazas.length > 0 && verifiedCount === 0 ? (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">Toll charging is off until plazas are verified</p>
              <p className="mt-1 text-amber-900/90">
                Live detection only matches plazas marked Verified. Promote plazas from All plazas or Spatial after
                confirming GPS and radius — otherwise crossings stay at zero with no other error.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === 'all-plazas' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TollPlazaList
            plazas={plazas}
            loading={loading}
            onSelect={setSelectedPlaza}
            onEdit={(plaza) => {
              setEditingPlaza(plaza);
              setIsAddModalOpen(true);
            }}
            onDelete={handleDeletePlaza}
            onRefresh={fetchData}
            onAdd={() => {
              setEditingPlaza(null);
              setIsAddModalOpen(true);
            }}
            onPromote={handlePromotePlaza}
          />
        </div>
      ) : null}

      {activeTab === 'spatial-audit' ? (
        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2">
          <ErrorBoundary name="TollSpatialAuditMap">
            <TollSpatialAuditMap
              plazas={plazas}
              loading={loading}
              onSelectPlaza={setSelectedPlaza}
              onPlazaMoved={async (id, location) => {
                const plaza = plazas.find((p) => p.id === id);
                if (!plaza) return false;
                if (
                  !confirm(`Move "${plaza.name}" to ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}?`)
                ) {
                  return false;
                }
                try {
                  await handleUpdatePlaza(id, {
                    location: { ...plaza.location, lat: location.lat, lng: location.lng },
                  });
                  toast.success(`Moved "${plaza.name}".`);
                  return true;
                } catch {
                  return false;
                }
              }}
              onPlazaRadiusChange={async (id, radiusM) => {
                const plaza = plazas.find((p) => p.id === id);
                try {
                  await handleUpdatePlaza(id, { geofenceRadius: radiusM });
                  toast.success(
                    radiusM === 0
                      ? `"${plaza?.name || 'Plaza'}" now uses the global geofence default.`
                      : `"${plaza?.name || 'Plaza'}" geofence set to ${radiusM}m.`,
                  );
                } catch {
                  /* toast already shown */
                }
              }}
            />
          </ErrorBoundary>
        </div>
      ) : null}

      {activeTab === 'verified-plazas' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <VerifiedTollPlazasTab
            plazas={plazas.filter((p) => p.status === 'verified')}
            onUpdatePlaza={handleUpdatePlaza}
            onDemotePlaza={handleDemotePlaza}
            onRefresh={fetchData}
          />
        </div>
      ) : null}

      {activeTab === 'learnt-plazas' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <LearntTollPlazasTab
            learntPlazas={plazas.filter((p) => p.status === 'learnt')}
            verifiedPlazas={plazas.filter((p) => p.status === 'verified')}
            unverifiedPlazas={plazas.filter((p) => p.status === 'unverified')}
            onPromote={handlePromotePlaza}
            onDelete={handleDeletePlazaSilent}
            onMerge={handleMergeLearnt}
            onRefresh={fetchData}
            loading={loading}
          />
        </div>
      ) : null}

      <TollPlazaAttributionDialog
        open={isAttributionOpen}
        onOpenChange={setIsAttributionOpen}
        onApplied={fetchData}
      />

      <AddTollPlazaModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingPlaza(null);
        }}
        onSaved={fetchData}
        editingPlaza={editingPlaza}
      />

      {selectedPlaza ? (
        <TollPlazaDetailPanel
          plaza={selectedPlaza}
          isOpen={!!selectedPlaza}
          onClose={() => setSelectedPlaza(null)}
          onUpdate={handleUpdatePlaza}
          onDelete={handleDeletePlazaById}
          onPromote={handlePromotePlaza}
          onDemote={handleDemotePlaza}
          onEdit={handleEditFromPanel}
        />
      ) : null}

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
        <div className="flex items-center gap-2 italic text-slate-500">
          <Database className="h-4 w-4 not-italic text-slate-400" aria-hidden />
          <span>The data is not in yet.</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
          LOC: KINGSTON / PARISH REGISTRY JMD
        </div>
      </div>
    </div>
  );
}
