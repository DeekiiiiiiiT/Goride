import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { 
  MapPin, 
  ShieldCheck, 
  List, 
  RefreshCw, 
  Database,
  Loader2,
  BookOpen
} from 'lucide-react';
import { api } from '../../services/api';
import { TollPlaza } from '../../types/toll';
import { TollPlazaList } from './TollPlazaList';
import { AddTollPlazaModal } from './AddTollPlazaModal';
import { VerifiedTollPlazasTab } from './VerifiedTollPlazasTab';
import { TollSpatialAuditMap } from './TollSpatialAuditMap';
import { TollPlazaDetailPanel } from './TollPlazaDetailPanel';
import { LearntTollPlazasTab } from './LearntTollPlazasTab';
import { toast } from 'sonner@2.0.3';
import { Plus } from 'lucide-react';

export function TollDatabaseView() {
  const [plazas, setPlazas] = useState<TollPlaza[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlaza, setSelectedPlaza] = useState<TollPlaza | null>(null);
  const [editingPlaza, setEditingPlaza] = useState<TollPlaza | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900">Toll Database</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage toll plaza locations, spatial verification, and verified records.
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
        <Tabs defaultValue="all-plazas" className="w-full">
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

          {/* Tab 1: All Toll Plazas */}
          <TabsContent value="all-plazas" className="m-0 p-0 border-0">
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
          </TabsContent>

          {/* Tab 2: Spatial Audit */}
          <TabsContent value="spatial-audit" className="m-0 p-0 border-0">
            <div className="h-[700px]">
              <TollSpatialAuditMap
                plazas={plazas}
                loading={loading}
                onSelectPlaza={setSelectedPlaza}
              />
            </div>
          </TabsContent>

          {/* Tab 3: Verified Toll Plaza */}
          <TabsContent value="verified-plazas" className="m-0 p-0 border-0">
            <VerifiedTollPlazasTab
              plazas={plazas.filter(p => p.status === 'verified')}
              onUpdatePlaza={handleUpdatePlaza}
              onDemotePlaza={handleDemotePlaza}
              onRefresh={fetchData}
            />
          </TabsContent>

          {/* Tab 4: Learnt Toll Plaza */}
          <TabsContent value="learnt-plazas" className="m-0 p-0 border-0">
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
          </TabsContent>
        </Tabs>
      </div>

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
    </div>
  );
}