import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { EquipmentTemplate } from '../../services/templateService';
import { EquipmentItem } from '../../types/equipment';
import { Plus, Trash2, Package } from 'lucide-react';
import { toast } from "sonner@2.0.3";

interface AddTemplateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (template: EquipmentTemplate) => Promise<void>;
}

export function AddTemplateModal({ isOpen, onClose, onSave }: AddTemplateModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState<Partial<EquipmentItem>[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New Item Form State
    const [newItemName, setNewItemName] = useState('');
    const [newItemCategory, setNewItemCategory] = useState<string>('Equipment');
    const [newItemCost, setNewItemCost] = useState('');

    const handleAddItem = () => {
        if (!newItemName) {
            toast.error("Item name is required");
            return;
        }

        const newItem: Partial<EquipmentItem> = {
            id: crypto.randomUUID(),
            name: newItemName,
            category: newItemCategory as any,
            price: parseFloat(newItemCost) || 0,
            status: 'Good'
        };

        setItems([...items, newItem]);
        
        // Reset form
        setNewItemName('');
        setNewItemCost('');
        // Keep category for convenience
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (!name) {
            toast.error("Template name is required");
            return;
        }

        if (items.length === 0) {
            toast.error("Add at least one item to the template");
            return;
        }

        try {
            setIsSubmitting(true);
            const template: EquipmentTemplate = {
                id: crypto.randomUUID(),
                name,
                description,
                items: items as EquipmentItem[], // We cast here assuming the partials are sufficient for the template definition
                createdAt: new Date().toISOString()
            };

            await onSave(template);
            
            // Reset and close
            setName('');
            setDescription('');
            setItems([]);
            onClose();
        } catch (error) {
            console.error(error);
            // Error handling is done in parent
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create New Template</DialogTitle>
                    <DialogDescription>
                        Define a reusable kit of equipment that can be assigned to vehicles in bulk.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Template Details */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Template Name</Label>
                            <Input 
                                id="name" 
                                placeholder="e.g. New Driver Safety Kit" 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea 
                                id="description" 
                                placeholder="What's included in this kit?" 
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="text-sm font-medium mb-4 flex items-center">
                            <Package className="w-4 h-4 mr-2" /> Template Items
                        </h4>

                        {/* Item List */}
                        {items.length > 0 ? (
                            <div className="space-y-2 mb-4">
                                {items.map((item, index) => (
                                    <div key={index} className="flex justify-between items-center bg-slate-50 p-3 rounded-md border">
                                        <div>
                                            <p className="font-medium text-sm">{item.name}</p>
                                            <p className="text-xs text-muted-foreground">{item.category} • ${item.price}</p>
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => handleRemoveItem(index)}
                                            className="h-8 w-8 text-slate-400 hover:text-red-500"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 bg-slate-50 rounded-md border border-dashed mb-4">
                                <p className="text-sm text-muted-foreground">No items added to this template yet.</p>
                            </div>
                        )}

                        {/* Add Item Form */}
                        <div className="flex gap-2 items-end bg-slate-50 p-3 rounded-md border">
                            <div className="flex-1 space-y-2">
                                <Label htmlFor="item-name" className="text-xs">Item Name</Label>
                                <Input 
                                    id="item-name"
                                    placeholder="e.g. Dash Cam" 
                                    value={newItemName}
                                    onChange={(e) => setNewItemName(e.target.value)}
                                    className="h-8"
                                />
                            </div>
                            <div className="w-[120px] space-y-2">
                                <Label htmlFor="item-cat" className="text-xs">Category</Label>
                                <Select value={newItemCategory} onValueChange={setNewItemCategory}>
                                    <SelectTrigger id="item-cat" className="h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Equipment">Equipment</SelectItem>
                                        <SelectItem value="Safety">Safety</SelectItem>
                                        <SelectItem value="Exterior">Exterior</SelectItem>
                                        <SelectItem value="Documents">Documents</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="w-[80px] space-y-2">
                                <Label htmlFor="item-cost" className="text-xs">Cost ($)</Label>
                                <Input 
                                    id="item-cost"
                                    type="number"
                                    placeholder="0" 
                                    value={newItemCost}
                                    onChange={(e) => setNewItemCost(e.target.value)}
                                    className="h-8"
                                />
                            </div>
                            <Button size="sm" onClick={handleAddItem} className="h-8" variant="secondary">
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSubmitting}>
                        {isSubmitting ? "Saving..." : "Create Template"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
