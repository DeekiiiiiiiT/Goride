import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Plus, Upload, Tag, Receipt } from "lucide-react";
import { TollTagList } from "../components/toll-tags/TollTagList";
import { TollTagDetail } from "../components/toll-tags/TollTagDetail";
import { AddTollTagModal } from "../components/toll-tags/AddTollTagModal";
import { AssignTagModal } from "../components/toll-tags/AssignTagModal";
import { BulkImportTagsModal } from "../components/toll-tags/BulkImportTagsModal";
import { ReconciliationDashboard } from "../components/toll-tags/reconciliation/ReconciliationDashboard";
import { api } from "../services/api";
import { TollTag, TollProvider, TollTagStatus, Vehicle } from "../types/vehicle";
import { toast } from "sonner";

export function TollTags() {
  const [tags, setTags] = useState<TollTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<TollTag | null>(null);
  const [activeTab, setActiveTab] = useState("inventory");
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

  const handleAddTag = async (data: { provider: TollProvider; tagNumber: string; status: TollTagStatus }) => {
    try {
      await api.saveTollTag(data);
      toast.success("Toll tag added successfully");
      fetchTags();
    } catch (error) {
      console.error("Failed to save tag:", error);
      toast.error("Failed to save toll tag");
      throw error; 
    }
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
        assignedVehicleName: undefined
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
              />
          </div>
      );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Toll Management
            </h1>
            <p className="text-slate-500 text-sm mt-1">
                Manage transponders and reconcile expenses.
            </p>
        </div>
        
        {activeTab === 'inventory' && (
            <div className="flex gap-2">
                <Button onClick={() => setIsAddModalOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add New Tag
                </Button>
            </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-[300px] mb-4">
            <TabsTrigger value="inventory" className="flex-1">
                <Tag className="w-4 h-4 mr-2" />
                Tag Inventory
            </TabsTrigger>
            <TabsTrigger value="reconciliation" className="flex-1">
                <Receipt className="w-4 h-4 mr-2" />
                Reconciliation
            </TabsTrigger>
        </TabsList>
      
        <TabsContent value="inventory">
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
                />
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="reconciliation">
            <ReconciliationDashboard />
        </TabsContent>
      </Tabs>

      <AddTollTagModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSave={handleAddTag} 
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
