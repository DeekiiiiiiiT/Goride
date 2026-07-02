import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Plus, Tag, RefreshCw, Loader2 } from "lucide-react";
import { TollTagList } from "../components/toll-tags/TollTagList";
import { TollTagDetail } from "../components/toll-tags/TollTagDetail";
import { AddTollTagModal } from "../components/toll-tags/AddTollTagModal";
import { AssignTagModal } from "../components/toll-tags/AssignTagModal";
import { BulkImportTagsModal } from "../components/toll-tags/BulkImportTagsModal";
import { api } from "../services/api";
import { TollTag, TollProvider, TollTagStatus, Vehicle } from "../types/vehicle";
import { toast } from "sonner";

export function TagInventory({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [tags, setTags] = useState<TollTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<TollTag | null>(null);
  const [editingTag, setEditingTag] = useState<TollTag | null>(null);
  const [assignModalState, setAssignModalState] = useState<{ isOpen: boolean; tag: TollTag | null }>({
    isOpen: false,
    tag: null
  });
  // "Sync Tag History" — links existing tolls to their tag so each tag shows its
  // full lifetime activity across vehicle reassignments.
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncPreviewing, setSyncPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any | null>(null);

  const openSync = async () => {
    setSyncOpen(true);
    setSyncStatus(null);
    setSyncPreviewing(true);
    try {
      const res = await api.getTollTagBackfillStatus();
      setSyncStatus(res?.summary || null);
    } catch (error) {
      console.error("Failed to preview tag history sync:", error);
      toast.error("Couldn't check tag history. Please try again.");
      setSyncOpen(false);
    } finally {
      setSyncPreviewing(false);
    }
  };

  const confirmSync = async () => {
    setSyncing(true);
    try {
      const res = await api.runTollTagBackfill(false);
      const linked = res?.summary?.linked ?? 0;
      toast.success(linked > 0 ? `Linked ${linked} toll${linked === 1 ? '' : 's'} to their tags.` : "Tag history is already up to date.");
      setSyncOpen(false);
      fetchTags();
    } catch (error) {
      console.error("Failed to sync tag history:", error);
      toast.error("Failed to sync tag history. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const fetchTags = async () => {
    setIsLoading(true);
    try {
      const data = await api.getTollTags();
      setTags(data);
    } catch (error) {
      console.error("Failed to fetch tags:", error);
      toast.error("Failed to load toll tags");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleSaveTag = async (data: { provider: TollProvider; tagNumber: string; status: TollTagStatus; dateAdded?: string }) => {
    try {
      const payload = editingTag ? { ...data, id: editingTag.id, createdAt: editingTag.createdAt } : data;
      await api.saveTollTag(payload);
      toast.success(editingTag ? "Toll tag updated" : "Toll tag added successfully");
      fetchTags();
      setEditingTag(null);
    } catch (error) {
      console.error("Failed to save tag:", error);
      toast.error("Failed to save toll tag");
      throw error; 
    }
  };

  const handleEditTag = (tag: TollTag) => {
    setEditingTag(tag);
    setIsAddModalOpen(true);
  };

  const handleDeleteTag = async (id: string) => {
    try {
      await api.deleteTollTag(id);
      toast.success("Toll tag deleted");
      setTags(prev => prev.filter(t => t.id !== id));
      if (selectedTag?.id === id) setSelectedTag(null);
    } catch (error) {
      console.error("Failed to delete tag:", error);
      toast.error("Failed to delete toll tag");
    }
  };

  const handleAssignClick = (tag: TollTag) => {
    setAssignModalState({ isOpen: true, tag });
  };

  const handleUnassignClick = async (tag: TollTag) => {
    if (!window.confirm(`Are you sure you want to unassign this tag from ${tag.assignedVehicleName}?`)) return;

    try {
      if (tag.assignedVehicleId) {
        const vehicles = await api.getVehicles();
        const vehicle = vehicles.find((v: Vehicle) => v.id === tag.assignedVehicleId);
        
        if (vehicle) {
            const updatedVehicle = {
                ...vehicle,
                tollTagId: undefined,
                tollTagUuid: undefined,
                tollTagProvider: undefined
            };
            await api.saveVehicle(updatedVehicle);
        }
      }

      const updatedTag = {
        ...tag,
        assignedVehicleId: undefined,
        assignedVehicleName: undefined,
        // Phase 8: Close current assignment in history
        assignmentHistory: (tag.assignmentHistory || []).map((entry: any) =>
          entry.vehicleId === tag.assignedVehicleId && !entry.unassignedAt
            ? { ...entry, unassignedAt: new Date().toISOString() }
            : entry
        ),
        updatedAt: new Date().toISOString(),
      };
      await api.saveTollTag(updatedTag);

      toast.success("Tag unassigned successfully");
      fetchTags();
      if (selectedTag?.id === tag.id) setSelectedTag(updatedTag);
    } catch (error) {
      console.error("Failed to unassign tag:", error);
      toast.error("Failed to unassign tag");
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
                  onNavigateToReconciliation={onNavigate ? (_vehicleId: string) => {
                      onNavigate('toll-tags');
                  } : undefined}
              />
          </div>
      );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Tag Inventory
            </h1>
            <p className="text-slate-500 text-sm mt-1">
                Manage your toll transponders and vehicle assignments.
            </p>
        </div>
        
        <div className="flex gap-2">
            <Button variant="outline" onClick={openSync}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Tag History
            </Button>
            <Button onClick={() => { setEditingTag(null); setIsAddModalOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Add New Tag
            </Button>
        </div>
      </div>

      <Card>
          <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <CardDescription>
              A centralized list of all toll tags owned by the fleet.
          </CardDescription>
          </CardHeader>
          <CardContent>
          <TollTagList 
              tags={tags} 
              isLoading={isLoading} 
              onDelete={handleDeleteTag} 
              onAssign={handleAssignClick}
              onUnassign={handleUnassignClick}
              onViewHistory={setSelectedTag}
              onEdit={handleEditTag}
          />
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

      {assignModalState.tag && (
        <AssignTagModal
            isOpen={assignModalState.isOpen}
            onClose={() => setAssignModalState({ isOpen: false, tag: null })}
            tag={assignModalState.tag}
            onAssign={handleAssignComplete}
        />
      )}

      {/* Sync Tag History — preview then apply the tag-link backfill */}
      <Dialog open={syncOpen} onOpenChange={(o) => { if (!syncing) setSyncOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Tag History</DialogTitle>
            <DialogDescription>
              This links your existing tolls to the tag that paid them, so each tag shows its full history — including tolls from when the tag was on a different vehicle. It only adds links; nothing is deleted or changed.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-sm">
            {syncPreviewing ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking your tolls…
              </div>
            ) : syncStatus ? (
              (syncStatus.willLink ?? 0) > 0 ? (
                <div className="space-y-2">
                  <p className="text-slate-700">
                    <span className="font-semibold text-indigo-600">{syncStatus.willLink}</span> toll{syncStatus.willLink === 1 ? '' : 's'} can be linked to their tag.
                  </p>
                  {(() => {
                    const unresolved = (syncStatus.unresolvedNoWindow ?? 0) + (syncStatus.unresolvedNoVehicle ?? 0) + (syncStatus.ambiguous ?? 0);
                    return unresolved > 0 ? (
                      <p className="text-xs text-slate-500">
                        {unresolved} toll{unresolved === 1 ? '' : 's'} couldn’t be matched to a tag automatically (missing vehicle or assignment info) and will be left as-is.
                      </p>
                    ) : null;
                  })()}
                </div>
              ) : (
                <p className="text-slate-600">Everything is already linked — nothing to sync.</p>
              )
            ) : (
              <p className="text-slate-500">No data available.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncOpen(false)} disabled={syncing}>
              {syncStatus && (syncStatus.willLink ?? 0) === 0 ? 'Close' : 'Cancel'}
            </Button>
            {syncStatus && (syncStatus.willLink ?? 0) > 0 && (
              <Button onClick={confirmSync} disabled={syncing || syncPreviewing}>
                {syncing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing…</>) : 'Sync now'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}