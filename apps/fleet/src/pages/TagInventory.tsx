import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Plus, Upload } from "lucide-react";
import { Input } from "../components/ui/input";
import { tollErrorMessage } from "../services/tollApiError";
import { TollLoadError } from "../components/toll-tags/TollLoadError";
import { classifyTagBalance, isLowBalance, resolveLowBalanceThreshold } from "../utils/tollTagBurnRate";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { TollTagList } from "../components/toll-tags/TollTagList";
import { TollTagDetail } from "../components/toll-tags/TollTagDetail";
import { AddTollTagModal } from "../components/toll-tags/AddTollTagModal";
import { AssignTagModal } from "../components/toll-tags/AssignTagModal";
import { BulkImportTagsModal } from "../components/toll-tags/BulkImportTagsModal";
import { api } from "../services/api";
import { TollTag, TollProvider, TollTagStatus, Vehicle } from "../types/vehicle";
import { toast } from "sonner";
import { FleetBusyProvider } from "../components/shared/FleetBusyLock";

export function TagInventory({
  onNavigate,
}: {
  onNavigate?: (page: string, opts?: { vehicleId?: string; driverId?: string; vehicleLabel?: string }) => void;
}) {
  return (
    <FleetBusyProvider>
      <TagInventoryInner onNavigate={onNavigate} />
    </FleetBusyProvider>
  );
}

function TagInventoryInner({
  onNavigate,
}: {
  onNavigate?: (page: string, opts?: { vehicleId?: string; driverId?: string; vehicleLabel?: string }) => void;
}) {
  const [tags, setTags] = useState<TollTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const [unassignTag, setUnassignTag] = useState<TollTag | null>(null);
  const [retireTag, setRetireTag] = useState<TollTag | null>(null);
  const [retireReason, setRetireReason] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<TollTag | null>(null);
  const [editingTag, setEditingTag] = useState<TollTag | null>(null);
  const [assignModalState, setAssignModalState] = useState<{ isOpen: boolean; tag: TollTag | null }>({
    isOpen: false,
    tag: null
  });

  const fetchTags = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.getTollTags();
      setTags(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch tags:", error);
      const message = tollErrorMessage(error, "Failed to load toll tags");
      setTags([]);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleSaveTag = async (data: { provider: TollProvider; tagNumber: string; status: TollTagStatus; dateAdded?: string }) => {
    try {
      const payload = editingTag
        ? { ...data, id: editingTag.id, createdAt: editingTag.createdAt, expectedUpdatedAt: editingTag.updatedAt }
        : data;
      await api.saveTollTag(payload);
      toast.success(editingTag ? "Toll tag updated" : "Toll tag added successfully");
      fetchTags();
      setEditingTag(null);
    } catch (error) {
      console.error("Failed to save tag:", error);
      toast.error(tollErrorMessage(error, "Failed to save toll tag"));
      throw error; 
    }
  };

  const handleEditTag = (tag: TollTag) => {
    setEditingTag(tag);
    setIsAddModalOpen(true);
  };

  const handleDeleteTag = (id: string) => {
    const tag = tags.find((item) => item.id === id);
    if (!tag) return;
    setRetireReason('');
    setRetireTag(tag);
  };

  const confirmRetire = async () => {
    if (!retireTag) return;
    if (!retireReason.trim()) {
      toast.error('Add a reason for retiring this tag');
      return;
    }
    try {
      await api.deleteTollTag(retireTag.id, {
        reason: retireReason.trim(),
        expectedUpdatedAt: retireTag.updatedAt,
      });
      toast.success("Toll tag retired");
      setTags(prev => prev.filter(t => t.id !== retireTag.id));
      if (selectedTag?.id === retireTag.id) setSelectedTag(null);
      setRetireTag(null);
    } catch (error) {
      console.error("Failed to retire tag:", error);
      toast.error(tollErrorMessage(error, "Failed to retire toll tag"));
    }
  };

  const handleAssignClick = (tag: TollTag) => {
    setAssignModalState({ isOpen: true, tag });
  };

  const handleUnassignClick = (tag: TollTag) => {
    setUnassignTag(tag);
  };

  const confirmUnassign = async () => {
    if (!unassignTag) return;
    try {
      const res = await api.unassignTollTag(unassignTag.id);
      const updatedTag = res?.data || { ...unassignTag, assignedVehicleId: undefined, assignedVehicleName: undefined };
      toast.success("Tag unassigned successfully");
      setUnassignTag(null);
      fetchTags();
      if (selectedTag?.id === unassignTag.id) setSelectedTag(updatedTag);
    } catch (error) {
      console.error("Failed to unassign tag:", error);
      toast.error(tollErrorMessage(error, "Failed to unassign tag"));
    }
  };

  const handleAssignComplete = () => {
    toast.success("Tag assigned successfully");
    fetchTags();
  };

  // If a tag is selected, show detail view
  if (selectedTag) {
      return (
          <div className="p-6">
              <TollTagDetail 
                  tag={selectedTag} 
                  onBack={() => setSelectedTag(null)}
                  onRequestAssign={() => {
                    setAssignModalState({ isOpen: true, tag: selectedTag });
                  }}
                  onNavigateToReconciliation={onNavigate ? async (vehicleId: string) => {
                      try {
                        const vehicles = await api.getVehicles();
                        const vehicle = vehicles.find((v: Vehicle) => v.id === vehicleId);
                        const driverId =
                          (vehicle as any)?.currentDriverId ||
                          (vehicle as any)?.assignedDriverId ||
                          (vehicle as any)?.driverId ||
                          undefined;
                        const vehicleLabel =
                          vehicle?.licensePlate ||
                          selectedTag.assignedVehicleName ||
                          vehicleId;
                        onNavigate('toll-tags', { vehicleId, driverId, vehicleLabel });
                      } catch (error) {
                        console.error("Failed to resolve vehicle for reconciliation:", error);
                        onNavigate('toll-tags', {
                          vehicleId,
                          vehicleLabel: selectedTag.assignedVehicleName || vehicleId,
                        });
                      }
                  } : undefined}
              />
              {assignModalState.tag && (
                <AssignTagModal
                  isOpen={assignModalState.isOpen}
                  onClose={() => setAssignModalState({ isOpen: false, tag: null })}
                  tag={assignModalState.tag}
                  onAssign={() => {
                    handleAssignComplete();
                    setSelectedTag(null);
                  }}
                />
              )}
          </div>
      );
  }

  const liveTags = tags.filter((tag) => tag.status !== 'Retired');
  const countOf = (pick: (tag: TollTag) => boolean) => (loadError || isLoading ? '—' : String(liveTags.filter(pick).length));
  const thresholdOf = (tag: TollTag) => resolveLowBalanceThreshold(tag.lowBalanceThreshold, tag.resolvedLowBalanceThreshold);
  const providers = [...new Set(liveTags.map((tag) => tag.provider).filter(Boolean))].sort();
  const query = search.trim().toLowerCase();
  const visibleTags = liveTags.filter((tag) => {
    if (provider !== 'all' && tag.provider !== provider) return false;
    if (!query) return true;
    return `${tag.tagNumber} ${tag.provider} ${tag.assignedVehicleName || ''}`.toLowerCase().includes(query);
  });

  const exportCsv = () => {
    const lines = [
      ['Provider', 'Tag number', 'Status', 'Vehicle', 'Balance', 'Alert at'],
      ...visibleTags.map((tag) => [
        tag.provider,
        tag.tagNumber,
        tag.status,
        tag.assignedVehicleName || '',
        tag.lastCalculatedBalance == null ? '' : String(tag.lastCalculatedBalance),
        String(thresholdOf(tag)),
      ]),
    ];
    const csv = lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'toll-tags.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="hidden md:block">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Tag Inventory
            </h1>
            <p className="mt-1 text-sm text-slate-500">
                Manage your toll transponders and vehicle assignments.
            </p>
        </div>
        
        <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={exportCsv} disabled={!visibleTags.length}>Export</Button>
            <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import
            </Button>
            <Button onClick={() => { setEditingTag(null); setIsAddModalOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Add New Tag
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          ['Total', countOf(() => true)],
          ['Assigned', countOf((tag) => Boolean(tag.assignedVehicleId))],
          ['Unassigned', countOf((tag) => !tag.assignedVehicleId)],
          ['Low', countOf((tag) => isLowBalance(tag.lastCalculatedBalance, thresholdOf(tag)))],
          ['Unknown', countOf((tag) => classifyTagBalance(tag.lastCalculatedBalance, thresholdOf(tag)) === 'unknown')],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
          <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <CardDescription>
              A centralized list of all toll tags owned by the fleet.
          </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tag or vehicle" aria-label="Search tags" />
            <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" value={provider} aria-label="Provider" onChange={(e) => setProvider(e.target.value)}>
              <option value="all">All providers</option>
              {providers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          {loadError ? (
            <TollLoadError message={loadError} onRetry={() => void fetchTags()} />
          ) : (
          <TollTagList 
              tags={visibleTags} 
              isLoading={isLoading}
              emptyTitle={liveTags.length === 0 ? 'No tags found' : 'No tags match'}
              emptyDescription={liveTags.length === 0 ? 'Get started by adding your first toll tag.' : 'Try a different search or provider.'}
              onDelete={handleDeleteTag} 
              onAssign={handleAssignClick}
              onUnassign={handleUnassignClick}
              onViewHistory={setSelectedTag}
              onEdit={handleEditTag}
          />
          )}
          </CardContent>
      </Card>

      <AddTollTagModal 
        isOpen={isAddModalOpen} 
        onClose={() => { setIsAddModalOpen(false); setEditingTag(null); }} 
        onSave={handleSaveTag} 
        initialData={editingTag || undefined}
      />

      <BulkImportTagsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
            fetchTags();
        }}
      />

      <AlertDialog open={!!unassignTag} onOpenChange={(open) => { if (!open) setUnassignTag(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign this tag?</AlertDialogTitle>
            <AlertDialogDescription>
              {unassignTag?.tagNumber} will come off {unassignTag?.assignedVehicleName || 'its vehicle'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmUnassign()}>Unassign</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!retireTag} onOpenChange={(open) => { if (!open) setRetireTag(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire this tag?</AlertDialogTitle>
            <AlertDialogDescription>
              {retireTag?.tagNumber} stays on past toll charges and must be unassigned first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={retireReason} onChange={(e) => setRetireReason(e.target.value)} placeholder="Reason" aria-label="Retire reason" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRetire()}>Retire tag</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {assignModalState.tag && (
        <AssignTagModal
            isOpen={assignModalState.isOpen}
            onClose={() => setAssignModalState({ isOpen: false, tag: null })}
            tag={assignModalState.tag}
            onAssign={handleAssignComplete}
        />
      )}
    </div>
  );
}
