import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { InventoryItem } from '../../types/fleet';

interface AddInventoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: InventoryItem) => Promise<void>;
}

export function AddInventoryModal({ isOpen, onClose, onSave }: AddInventoryModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<InventoryItem>>({
        name: '',
        category: '',
        quantity: 0,
        minQuantity: 5,
        costPerUnit: 0,
        location: '',
        description: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const newItem: InventoryItem = {
                id: crypto.randomUUID(),
                name: formData.name || 'New Item',
                category: formData.category || 'General',
                quantity: Number(formData.quantity) || 0,
                minQuantity: Number(formData.minQuantity) || 0,
                costPerUnit: Number(formData.costPerUnit) || 0,
                location: formData.location || '',
                description: formData.description || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await onSave(newItem);
            // Reset form
            setFormData({
                name: '',
                category: '',
                quantity: 0,
                minQuantity: 5,
                costPerUnit: 0,
                location: '',
                description: ''
            });
            onClose();
        } catch (error) {
            console.error("Error saving inventory item:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add Inventory Item</DialogTitle>
                    <DialogDescription>
                        Enter the details of the new item to add to your inventory.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">Name</Label>
                        <Input 
                            id="name" 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="col-span-3" 
                            required
                            placeholder="e.g. First Aid Kit"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="category" className="text-right">Category</Label>
                        <Input 
                            id="category" 
                            value={formData.category} 
                            onChange={e => setFormData({...formData, category: e.target.value})}
                            className="col-span-3" 
                            placeholder="e.g. Safety"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="quantity" className="text-right">Quantity</Label>
                        <Input 
                            id="quantity" 
                            type="number"
                            min="0"
                            value={formData.quantity} 
                            onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
                            className="col-span-3" 
                            required
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="minQuantity" className="text-right">Min Qty</Label>
                        <Input 
                            id="minQuantity" 
                            type="number"
                            min="0"
                            value={formData.minQuantity} 
                            onChange={e => setFormData({...formData, minQuantity: parseInt(e.target.value) || 0})}
                            className="col-span-3" 
                            required
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="cost" className="text-right">Cost ($)</Label>
                        <Input 
                            id="cost" 
                            type="number"
                            min="0"
                            step="0.01"
                            value={formData.costPerUnit} 
                            onChange={e => setFormData({...formData, costPerUnit: parseFloat(e.target.value) || 0})}
                            className="col-span-3" 
                            required
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="location" className="text-right">Location</Label>
                        <Input 
                            id="location" 
                            value={formData.location} 
                            onChange={e => setFormData({...formData, location: e.target.value})}
                            className="col-span-3" 
                            placeholder="e.g. Warehouse A"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : "Save Item"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
