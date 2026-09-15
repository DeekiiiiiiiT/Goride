import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Plus } from "lucide-react";
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
      const res = await api.unassignTollTag(tag.id);
      const updatedTag = res?.data || { ...tag, assignedVehicleId: undefined, assignedVehicleName: undefined };
      toast.success("Tag unassigned successfully");
      fetchTags();
      if (selectedTag?.id === tag.id) setSelectedTag(updatedTag);
    } catch (error) {
      console.error("Failed to unassign tag:", error);
      toast.error(error instanceof Error ? error.message : "Failed to unassign tag");
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
    </div>
  );
}
