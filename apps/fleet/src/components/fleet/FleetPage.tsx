import React, { useState, useEffect } from 'react';
import { useFleetExpenses, useInventory } from '../../hooks/useFleetData';
import { templateService, EquipmentTemplate } from '../../services/templateService';
import { equipmentService } from '../../services/equipmentService';
import { inventoryService } from '../../services/inventoryService';
import { InventoryTable } from './InventoryTable';
import { EquipmentList } from './EquipmentList';
import { TemplateCard } from './TemplateCard';
import { BulkAssignmentModal } from './BulkAssignmentModal';
import { AddInventoryModal } from './AddInventoryModal';
import { AddTemplateModal } from './AddTemplateModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Plus, LayoutGrid, Settings, Database, AlertCircle } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { EquipmentItem } from '../../types/equipment';
import { InventoryItem } from '../../types/fleet';
import { seederService } from '../../services/seederService';
import { getInventoryAlerts, getVehicleAlerts, FleetAlert } from '../../utils/alertHelpers';
import { AlertsList } from './AlertsList';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function FleetPage() {
    const { equipment, vehicles, loading: fleetLoading, refresh: refreshFleet } = useFleetExpenses();
    const { inventory, loading: inventoryLoading, refresh: refreshInventory } = useInventory();
    const [templates, setTemplates] = useState<EquipmentTemplate[]>([]);
    const [alerts, setAlerts] = useState<FleetAlert[]>([]);
    
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [isAddInventoryOpen, setIsAddInventoryOpen] = useState(false);
    const [isAddTemplateOpen, setIsAddTemplateOpen] = useState(false);

    useEffect(() => {
        loadTemplates();
    }, []);

    useEffect(() => {
        if (!fleetLoading && !inventoryLoading) {
            const invAlerts = getInventoryAlerts(inventory);
            const vehAlerts = getVehicleAlerts(vehicles);
            setAlerts([...invAlerts, ...vehAlerts]);
        }
    }, [inventory, vehicles, fleetLoading, inventoryLoading]);

    const loadTemplates = async () => {
        try {
            const data = await templateService.getTemplates();
            setTemplates(data);
        } catch (e) {
            console.error("Failed to load templates", e);
        }
    };

    const handleSeedData = async () => {
        if (!confirm("This will populate default inventory and templates. Continue?")) return;
        try {
            const result = await seederService.seedInitialData();
            toast.success(`Seeded ${result.inventoryCount} items and ${result.templatesCount} templates.`);
            refreshInventory();
            loadTemplates();
        } catch (e: any) {
            toast.error("Failed to seed data: " + e.message);
        }
    };

    const handleBulkAssign = async (vehicleIds: string[], sourceId: string, sourceType: 'template' | 'inventory') => {
        try {
            const itemsToAssign: EquipmentItem[] = [];
            const timestamp = new Date().toISOString();

            // Prepare items based on source
            for (const vid of vehicleIds) {
                if (sourceType === 'template') {
                    const template = templates.find(t => t.id === sourceId);
                    if (template) {
                         template.items.forEach(item => {
                             itemsToAssign.push({
                                 ...item,
                                 id: crypto.randomUUID(),
                                 vehicleId: vid,
                                 dateAssigned: timestamp,
                                 status: 'Active'
                             });
                         });
                    }
                } else {
                    const invItem = inventory.find(i => i.id === sourceId);
                    if (invItem) {
                        itemsToAssign.push({
                            id: crypto.randomUUID(),
                            name: invItem.name,
                            category: invItem.category,
                            price: invItem.costPerUnit,
                            dateAssigned: timestamp,
                            status: 'Active',
                            vehicleId: vid
                        });
                        // Note: Backend handles inventory quantity decrement if implemented, 
                        // or we need a separate call. Phase 1 didn't explicitly link them transactionally.
                        // Ideally the backend 'bulk' endpoint should handle this logic if extended.
                        // For now we just assign the item.
                    }
                }
            }

            if (itemsToAssign.length > 0) {
                await equipmentService.bulkAssignEquipment(itemsToAssign);
                toast.success(`Successfully assigned ${itemsToAssign.length} items to ${vehicleIds.length} vehicles.`);
                refreshFleet();
                if (sourceType === 'inventory') refreshInventory();
            }
        } catch (e: any) {
            toast.error("Failed to assign equipment: " + e.message);
        }
    };

    const handleAddInventory = async (item: InventoryItem) => {
        try {
            await inventoryService.saveStock(item);
            toast.success("Inventory item added successfully");
            refreshInventory();
        } catch (e: any) {
            toast.error("Failed to add item: " + e.message);
        }
    };

    const handleSaveTemplate = async (template: EquipmentTemplate) => {
        try {
            await templateService.saveTemplate(template);
            toast.success("Template created successfully");
            loadTemplates();
            setIsAddTemplateOpen(false);
        } catch (e: any) {
            toast.error("Failed to create template: " + e.message);
        }
    };

    if (fleetLoading || inventoryLoading) return <div className="p-8">Loading Fleet Data...</div>;

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Inventory & Asset Management</h1>
                <div className="flex gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon">
                                <Settings className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Fleet Tools</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleSeedData}>
                                <Database className="mr-2 h-4 w-4" /> Seed Default Data
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button onClick={() => setIsBulkModalOpen(true)}>
                        <LayoutGrid className="mr-2 h-4 w-4" /> Bulk Assignment
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="inventory" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="inventory">Inventory</TabsTrigger>
                    <TabsTrigger value="assignments">Assignments</TabsTrigger>
                    <TabsTrigger value="templates">Templates</TabsTrigger>
                    <TabsTrigger value="alerts" className="relative pr-6">
                        Alerts
                        {alerts.length > 0 && (
                            <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                                {alerts.length}
                            </span>
                        )}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="alerts">
                    <AlertsList alerts={alerts} />
                </TabsContent>

                <TabsContent value="inventory" className="space-y-4">
                    <div className="flex justify-between">
                         <h2 className="text-xl font-semibold">Stock Inventory</h2>
                         <Button variant="outline" size="sm" onClick={() => setIsAddInventoryOpen(true)}>
                             <Plus className="mr-2 h-4 w-4"/> Add Item
                         </Button>
                    </div>
                    <InventoryTable 
                        items={inventory} 
                        onEdit={() => {}} 
                        onDelete={() => {}} 
                    />
                </TabsContent>

                <TabsContent value="assignments" className="space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                         {vehicles.map(vehicle => {
                             const vehicleEquipment = equipment.filter(e => e.vehicleId === vehicle.id);
                             return (
                                 <div key={vehicle.id} className="border rounded-lg p-4 bg-card">
                                     <h3 className="font-semibold mb-2">{vehicle.licensePlate} <span className="text-muted-foreground font-normal">({vehicle.make})</span></h3>
                                     <EquipmentList items={vehicleEquipment} />
                                 </div>
                             );
                         })}
                     </div>
                </TabsContent>

                <TabsContent value="templates" className="space-y-4">
                    <div className="flex justify-between">
                         <h2 className="text-xl font-semibold">Equipment Templates</h2>
                         <Button variant="outline" size="sm" onClick={() => setIsAddTemplateOpen(true)}><Plus className="mr-2 h-4 w-4"/> New Template</Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {templates.map(t => (
                            <TemplateCard 
                                key={t.id} 
                                template={t} 
                                onUse={() => {
                                    setIsBulkModalOpen(true);
                                }} 
                            />
                        ))}
                        {templates.length === 0 && <div className="col-span-3 text-center text-muted-foreground">No templates found.</div>}
                    </div>
                </TabsContent>
            </Tabs>

            <BulkAssignmentModal 
                isOpen={isBulkModalOpen}
                onClose={() => setIsBulkModalOpen(false)}
                vehicles={vehicles}
                templates={templates}
                inventory={inventory}
                onConfirm={handleBulkAssign}
            />
            
            <AddInventoryModal 
                isOpen={isAddInventoryOpen}
                onClose={() => setIsAddInventoryOpen(false)}
                onSave={handleAddInventory}
            />
            
            <AddTemplateModal 
                isOpen={isAddTemplateOpen}
                onClose={() => setIsAddTemplateOpen(false)}
                onSave={handleSaveTemplate}
            />
        </div>
    );
}
