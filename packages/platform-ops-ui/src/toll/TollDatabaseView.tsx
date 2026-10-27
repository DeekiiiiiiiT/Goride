// Stitch: dominion-redesign/e1395d7f82344dcab17453c7d3a98f4d
import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@roam/ui';
import { Badge } from '@roam/ui';
import { Button } from '@roam/ui';
import { 
  MapPin, 
  ShieldCheck, 
  List, 
  RefreshCw, 
  Database,
  Loader2,
  BookOpen,
  Link2
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
import { Plus } from 'lucide-react';
import { ErrorBoundary } from '@roam/roam-shared';

export function TollDatabaseView() {
  const [plazas, setPlazas] = useState<TollPlaza[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlaza, setSelectedPlaza] = useState<TollPlaza | null>(null);
  const [editingPlaza, setEditingPlaza] = useState<TollPlaza | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAttributionOpen, setIsAttributionOpen] = useState(false);
  /** Controlled so Spatial Audit map only mounts when the tab is visible (Leaflet needs real size). */
  const [activeTab, setActiveTab] = useState('all-plazas');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTollPlazas();
      setPlazas(data);
      console.log(`[TollDatabase] Loaded ${data.length} plazas`);
    } catch (e) {
      console.error('[TollDatabase] Failed to load plazas:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Delete handler
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

  // Update handler — merges partial updates, saves to KV, refreshes
  const handleUpdatePlaza = async (id: string, updates: Partial<TollPlaza>) => {
    const existing = plazas.find(p => p.id === id);
    if (!existing) return;
    try {
      await api.saveTollPlaza({ ...existing, ...updates, updatedAt: new Date().toISOString() });
      await fetchData();
    } catch (e) {
      console.error('[TollDatabase] Update failed:', e);
      toast.error('Failed to update toll plaza.');
      throw e; // let caller handle
    }
  };

  // Promote handler — sets status to verified
  const handlePromotePlaza = async (plaza: TollPlaza) => {
    try {
      await handleUpdatePlaza(plaza.id, { status: 'verified' });
      toast.success(`"${plaza.name}" promoted to Master Verified Ledger.`);
    } catch {
      // error toast already shown in handleUpdatePlaza
    }
  };

  // Demote handler — sets status back to unverified
  const handleDemotePlaza = async (id: string) => {
    const plaza = plazas.find(p => p.id === id);
    try {
      await handleUpdatePlaza(id, { status: 'unverified' });
      toast.success(`"${plaza?.name || 'Plaza'}" demoted to unverified.`);
    } catch {
      // error toast already shown in handleUpdatePlaza
    }
  };

  // Merge handler — merge a learnt plaza into an existing one (delete learnt, optionally enrich target)
  const handleMergeLearnt = async (learntPlaza: TollPlaza, targetPlaza: TollPlaza) => {
    try {
      // Delete the learnt plaza
      await api.deleteTollPlaza(learntPlaza.id);
      // Optionally update the target with any new info from the learnt entry
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

  // Delete plaza without confirm dialog (used by Learnt tab which has its own reject confirmation)
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

  // Delete-by-id handler (used by detail panel — no confirm dialog, panel handles that)
  const handleDeletePlazaById = async (id: string) => {
    const plaza = plazas.find(p => p.id === id);
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

  // Open edit modal from the detail panel
  const handleEditFromPanel = (plaza: TollPlaza) => {
    setSelectedPlaza(null); // close the detail panel first
    setEditingPlaza(plaza);
    setIsAddModalOpen(true);
  };

  // Derived counts
  const verifiedCount = plazas.filter(p => p.status === 'verified').length;
  const unverifiedCount = plazas.filter(p => p.status === 'unverified').length;
  const learntCount = plazas.filter(p => p.status === 'learnt').length;

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

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">Toll database</h1>
          <p className="mt-1 text-xs leading-normal text-slate-500">
            Plazas on Jamaican highways, and the class prices in JMD.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <Button
            size="sm"
            onClick={() => { setEditingPlaza(null); setIsAddModalOpen(true); }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add Plaza
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAttributionOpen(true)}
            className="gap-1.5"
          >
            <Link2 className="h-4 w-4" />
            Fix Plaza Attribution
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

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
              {(plazas.length === 0 ? [{ id: 'demo', name: 'Portmore' }] : plazas.slice(0, 1)).flatMap((plaza) =>
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

      {/* Silent-zero guard: detection requires verified plazas (audit I1 / C11) */}
      {!loading && plazas.length > 0 && verifiedCount === 0 && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="font-semibold">Toll charging is off until plazas are verified</p>
          <p className="mt-1 text-amber-900/90">
            Live detection only matches plazas marked Verified. Promote plazas from the list or
            Spatial Audit after confirming GPS and radius — otherwise crossings stay at zero with
            no other error.
          </p>
        </div>
      )}

      {/* Summary Stat Chips */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm">
          <span className="text-slate-500">Total:</span>
          <span className="font-semibold text-slate-900">{plazas.length}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-emerald-700 font-medium">Verified: {verifiedCount}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <span className="text-amber-700 font-medium">Unverified: {unverifiedCount}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-700 font-medium">Learnt: {learntCount}</span>
        </div>
      </div>

      {/* Tabs Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="border-b border-slate-200 px-4 py-3 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-slate-900">Toll Plaza Management</h3>
            </div>

            <TabsList className="bg-slate-200/50 p-1">
              <TabsTrigger value="all-plazas" className="flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <List className="h-3.5 w-3.5" />
                All Toll Plazas
                {plazas.length > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] border-slate-300 text-slate-500 ml-1">
                    {plazas.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="spatial-audit" className="flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <MapPin className="h-3.5 w-3.5" />
                Spatial Audit
              </TabsTrigger>
              <TabsTrigger value="verified-plazas" className="flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified Toll Plaza
                {verifiedCount > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] border-emerald-200 text-emerald-600 ml-1">
                    {verifiedCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="learnt-plazas" className="flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <BookOpen className="h-3.5 w-3.5" />
                Learnt
                {learntCount > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] border-amber-200 text-amber-600 ml-1">
                    {learntCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Panels rendered outside TabsContent — Radix hides inactive content with
              display:none, which leaves Leaflet at 0×0 and a blank Spatial Audit. */}
          {activeTab === 'all-plazas' && (
            <TollPlazaList
              plazas={plazas}
              loading={loading}
              onSelect={setSelectedPlaza}
              onEdit={(plaza) => { setEditingPlaza(plaza); setIsAddModalOpen(true); }}
              onDelete={handleDeletePlaza}
              onRefresh={fetchData}
              onAdd={() => { setEditingPlaza(null); setIsAddModalOpen(true); }}
              onPromote={handlePromotePlaza}
            />
          )}

          {activeTab === 'spatial-audit' && (
            <div className="w-full bg-slate-50 p-2">
              <ErrorBoundary name="TollSpatialAuditMap">
                <TollSpatialAuditMap
                  plazas={plazas}
                  loading={loading}
                  onSelectPlaza={setSelectedPlaza}
                  onPlazaMoved={async (id, location) => {
                    const plaza = plazas.find((p) => p.id === id);
                    if (!plaza) return false;
                    if (
                      !confirm(
                        `Move "${plaza.name}" to ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}?`,
                      )
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
                      // error toast already shown in handleUpdatePlaza
                    }
                  }}
                />
              </ErrorBoundary>
            </div>
          )}

          {activeTab === 'verified-plazas' && (
            <VerifiedTollPlazasTab
              plazas={plazas.filter(p => p.status === 'verified')}
              onUpdatePlaza={handleUpdatePlaza}
              onDemotePlaza={handleDemotePlaza}
              onRefresh={fetchData}
            />
          )}

          {activeTab === 'learnt-plazas' && (
            <LearntTollPlazasTab
              learntPlazas={plazas.filter(p => p.status === 'learnt')}
              verifiedPlazas={plazas.filter(p => p.status === 'verified')}
              unverifiedPlazas={plazas.filter(p => p.status === 'unverified')}
              onPromote={handlePromotePlaza}
              onDelete={handleDeletePlazaSilent}
              onMerge={handleMergeLearnt}
              onRefresh={fetchData}
              loading={loading}
            />
          )}
        </Tabs>
      </div>

      <TollPlazaAttributionDialog
        open={isAttributionOpen}
        onOpenChange={setIsAttributionOpen}
        onApplied={fetchData}
      />

      {/* Add / Edit Toll Plaza Modal */}
      <AddTollPlazaModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setEditingPlaza(null); }}
        onSaved={fetchData}
        editingPlaza={editingPlaza}
      />

      {/* Detail Panel */}
      {selectedPlaza && (
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
      )}

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