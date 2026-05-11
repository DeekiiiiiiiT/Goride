import React, { useState, useEffect } from 'react';
import { EquipmentItem, EquipmentStatus, EquipmentSubItem } from '../../types/equipment';
import { equipmentService } from '../../services/equipmentService';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Loader2, Plus, Pencil, Trash2, AlertTriangle, CheckCircle, HelpCircle, Wrench, Sparkles } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface EquipmentManagerProps {
    vehicleId: string;
}

const EquipmentManagerComponent: React.FC<EquipmentManagerProps> = ({ vehicleId }) => {
    const [items, setItems] = useState<EquipmentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<EquipmentItem>>({
        name: '',
        description: '',
        price: 0,
        shippingCost: 0,
        purchaseDate: '',
        status: 'Good',
        notes: '',
        subItems: []
    });

    useEffect(() => {
        loadEquipment();
    }, [vehicleId]);

    const loadEquipment = async () => {
        try {
            setLoading(true);
            const data = await equipmentService.getEquipment(vehicleId);
            // Allow all categories to support the new Fleet Management categories
            setItems(data);
        } catch (error) {
            toast.error("Failed to load equipment list");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (item?: EquipmentItem) => {
        if (item) {
            setEditingItem(item);
            setFormData({
                name: item.name,
                description: item.description || '',
                price: item.price,
                shippingCost: item.shippingCost || 0,
                purchaseDate: item.purchaseDate || '',
                status: item.status,
                notes: item.notes || '',
                subItems: item.subItems ? [...item.subItems] : []
            });
        } else {
            setEditingItem(null);
            setFormData({
                name: '',
                description: '',
                price: 0,
                shippingCost: 0,
                purchaseDate: new Date().toISOString().split('T')[0],
                status: 'New',
                notes: '',
                subItems: []
            });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name) {
            toast.error("Item name is required");
            return;
        }

        try {
            setIsSubmitting(true);
            
            const now = new Date().toISOString();
            const payload: EquipmentItem = {
                id: editingItem?.id || '',
                vehicleId: vehicleId,
                name: formData.name,
                category: 'Equipment',
                description: formData.description,
                price: formData.price || 0,
                shippingCost: formData.shippingCost || 0,
                purchaseDate: formData.purchaseDate,
                status: formData.status || 'Good',
                notes: formData.notes,
                subItems: formData.subItems || [],
                createdAt: editingItem?.createdAt || now,
                updatedAt: now
            };

            await equipmentService.saveEquipment(payload);
            toast.success(editingItem ? "Item updated" : "Item added");
            setIsDialogOpen(false);
            loadEquipment();
        } catch (error) {
            toast.error("Failed to save item");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this item?")) return;
        
        try {
            await equipmentService.deleteEquipment(vehicleId, id);
            toast.success("Item deleted");
            loadEquipment();
        } catch (error) {
            toast.error("Failed to delete item");
        }
    };

    const getStatusBadge = (status: EquipmentStatus) => {
        switch (status) {
            case 'New':
                return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600"><Sparkles className="w-3 h-3 mr-1" /> New</Badge>;
            case 'Good':
                return <Badge variant="default" className="bg-green-500 hover:bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> Good</Badge>;
            case 'Damaged':
                return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> Damaged</Badge>;
            case 'Missing':
                return <Badge variant="destructive" className="bg-red-700 hover:bg-red-800"><HelpCircle className="w-3 h-3 mr-1" /> Missing</Badge>;
            case 'Maintenance':
                return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-white"><Wrench className="w-3 h-3 mr-1" /> Maintenance</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Vehicle Equipment</h3>
                <Button onClick={() => handleOpenDialog()}>
                    <Plus className="w-4 h-4 mr-2" /> Add Item
                </Button>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Purchased</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                    No equipment assigned to this vehicle.
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        <div className="font-medium">{item.name}</div>
                                        <div className="flex flex-wrap gap-2 items-center mt-0.5">
                                            {item.category && <Badge variant="secondary" className="text-[10px] px-1 h-5">{item.category}</Badge>}
                                            {item.description && <span className="text-xs text-muted-foreground">{item.description}</span>}
                                        </div>
                                        {item.subItems && item.subItems.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {item.subItems.map(sub => (
                                                    <Badge key={sub.id} variant="outline" className="text-[10px] px-1 py-0 h-5">
                                                        + {sub.name}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                                    <TableCell>{item.purchaseDate || '-'}</TableCell>
                                    <TableCell className="text-right">
                                        <div>{item.price ? `$${Number(item.price).toLocaleString()}` : '-'}</div>
                                        {item.shippingCost ? (
                                            <div className="text-xs text-muted-foreground">
                                                +${Number(item.shippingCost).toLocaleString()} ship
                                            </div>
                                        ) : null}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(item)}>
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="text-destructive hover:text-destructive">
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingItem ? 'Edit Equipment' : 'Add Equipment'}</DialogTitle>
                        <DialogDescription>
                            {editingItem ? 'Update the details of the equipment item.' : 'Add a new item to the vehicle inventory.'}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="grid grid-cols-2 gap-4 py-4">
                        <div className="col-span-2 space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input 
                                id="name" 
                                value={formData.name} 
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                placeholder="e.g. Dash Camera"
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select 
                                value={formData.status} 
                                onValueChange={(val: EquipmentStatus) => setFormData({...formData, status: val})}
                            >
                                <SelectTrigger id="status">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="New">New</SelectItem>
                                    <SelectItem value="Good">Good</SelectItem>
                                    <SelectItem value="Damaged">Damaged</SelectItem>
                                    <SelectItem value="Missing">Missing</SelectItem>
                                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="purchaseDate">Purchased Date</Label>
                            <Input 
                                id="purchaseDate" 
                                type="date"
                                value={formData.purchaseDate} 
                                onChange={(e) => setFormData({...formData, purchaseDate: e.target.value})}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="price">Value ($)</Label>
                            <Input 
                                id="price" 
                                type="number"
                                value={formData.price} 
                                onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="shippingCost">Shipping Cost ($)</Label>
                            <Input 
                                id="shippingCost" 
                                type="number"
                                value={formData.shippingCost} 
                                onChange={(e) => setFormData({...formData, shippingCost: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        <div className="col-span-2 space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea 
                                id="description" 
                                value={formData.description} 
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                placeholder="Model, serial number, etc."
                                className="h-20"
                            />
                        </div>

                        {/* Sub Items Section */}
                        <div className="col-span-2 border-t pt-4 mt-2">
                            <div className="flex justify-between items-center mb-3">
                                <Label className="font-semibold text-sm">Included Items / Components</Label>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-7 text-xs"
                                    onClick={() => {
                                        const newSubItem: EquipmentSubItem = { id: crypto.randomUUID(), name: '', cost: 0 };
                                        setFormData(prev => ({ ...prev, subItems: [...(prev.subItems || []), newSubItem] }));
                                    }}
                                >
                                    <Plus className="w-3 h-3 mr-1" /> Add Component
                                </Button>
                            </div>
                            
                            {(formData.subItems || []).length > 0 ? (
                                <div className="space-y-3 bg-muted/30 p-3 rounded-md">
                                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1 mb-1">
                                        <div className="col-span-7">Item Name</div>
                                        <div className="col-span-4">Value</div>
                                        <div className="col-span-1"></div>
                                    </div>
                                    {formData.subItems?.map((sub, index) => (
                                        <div key={sub.id} className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-7">
                                                <Input 
                                                    placeholder="e.g. SIM Card" 
                                                    value={sub.name} 
                                                    onChange={(e) => {
                                                        const newSubs = [...(formData.subItems || [])];
                                                        newSubs[index] = { ...newSubs[index], name: e.target.value };
                                                        setFormData({ ...formData, subItems: newSubs });
                                                    }}
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                            <div className="col-span-4">
                                                <Input 
                                                    type="number" 
                                                    placeholder="Cost" 
                                                    value={sub.cost}
                                                    onChange={(e) => {
                                                        const newSubs = [...(formData.subItems || [])];
                                                        newSubs[index] = { ...newSubs[index], cost: parseFloat(e.target.value) || 0 };
                                                        setFormData({ ...formData, subItems: newSubs });
                                                    }}
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                            <div className="col-span-1 flex justify-center">
                                                <Button 
                                                    type="button" 
                                                    variant="ghost" 
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                    onClick={() => {
                                                        const newSubs = formData.subItems?.filter((_, i) => i !== index);
                                                        setFormData({ ...formData, subItems: newSubs });
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground italic text-center py-4 bg-muted/20 rounded border border-dashed">
                                    No additional components added (e.g. SIM cards, cables, mounts).
                                </div>
                            )}
                        </div>

                        <div className="col-span-2 space-y-2 mt-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea 
                                id="notes" 
                                value={formData.notes} 
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                placeholder="Damage details or maintenance notes..."
                                className="h-20"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export const EquipmentManager = React.memo(EquipmentManagerComponent);
