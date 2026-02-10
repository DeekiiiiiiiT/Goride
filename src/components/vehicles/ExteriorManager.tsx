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
import { Loader2, Plus, Pencil, Trash2, AlertTriangle, CheckCircle, HelpCircle, Wrench, Sparkles, ChevronDown } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { STANDARD_EXTERIOR_PARTS, DAMAGE_TYPES, EXTERIOR_SECTIONS } from '../../utils/vehicle_parts';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { DamageHistoryTimeline } from './DamageHistoryTimeline';
import { createDamageReport, appendDamageHistory } from '../../utils/equipment-helpers';

interface ExteriorManagerProps {
    vehicleId: string;
}

const ExteriorManagerComponent: React.FC<ExteriorManagerProps> = ({ vehicleId }) => {
    const [items, setItems] = useState<EquipmentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null);

    // Repair State
    const [repairItem, setRepairItem] = useState<EquipmentItem | null>(null);
    const [repairNotes, setRepairNotes] = useState('');
    const [repairCost, setRepairCost] = useState<number | ''>('');
    const [repairMerchant, setRepairMerchant] = useState('');
    const [repairDate, setRepairDate] = useState('');
    const [isRepairDialogOpen, setIsRepairDialogOpen] = useState(false);

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
            const dbParts = data.filter(item => item.category === 'Exterior');
            const dbPartNames = new Set(dbParts.map(p => p.name));

            const virtualParts = STANDARD_EXTERIOR_PARTS
                .filter(name => !dbPartNames.has(name))
                .map(name => ({
                    id: `virtual-${name.replace(/\s+/g, '-')}`,
                    vehicleId,
                    name,
                    category: 'Exterior' as const,
                    status: 'Good' as const,
                    price: 0,
                    description: 'Standard Part',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }));

            setItems([...dbParts, ...virtualParts]);
        } catch (error) {
            toast.error("Failed to load exterior parts list");
        } finally {
            setLoading(false);
        }
    };

    const groupedItems = React.useMemo(() => {
        const grouped: Record<string, EquipmentItem[]> = {};
        
        // Initialize sections
        Object.keys(EXTERIOR_SECTIONS).forEach(section => {
            grouped[section] = [];
        });
        grouped['Other / Custom'] = [];

        // Map items to sections
        items.forEach(item => {
            let found = false;
            for (const [section, parts] of Object.entries(EXTERIOR_SECTIONS)) {
                if (parts.includes(item.name)) {
                    grouped[section].push(item);
                    found = true;
                    break;
                }
            }
            if (!found) {
                grouped['Other / Custom'].push(item);
            }
        });

        return grouped;
    }, [items]);

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
                status: 'Good',
                notes: '',
                subItems: []
            });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name) {
            toast.error("Part name is required");
            return;
        }

        try {
            setIsSubmitting(true);
            
            const now = new Date().toISOString();
            const payload: EquipmentItem = {
                id: (editingItem?.id && !editingItem.id.startsWith('virtual-')) ? editingItem.id : '',
                vehicleId: vehicleId,
                name: formData.name,
                category: 'Exterior',
                description: formData.description,
                price: formData.price || 0,
                shippingCost: formData.shippingCost || 0,
                purchaseDate: formData.purchaseDate,
                status: formData.status || 'Good',
                notes: formData.notes,
                subItems: formData.subItems || [],
                damageHistory: editingItem?.damageHistory || [],
                createdAt: editingItem?.createdAt || now,
                updatedAt: now
            };

            await equipmentService.saveEquipment(payload);
            toast.success(editingItem ? "Part updated" : "Part added");
            setIsDialogOpen(false);
            loadEquipment();
        } catch (error) {
            toast.error("Failed to save part");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (id.startsWith('virtual-')) {
            toast.info("This is a standard part template. It cannot be deleted, only edited.");
            return;
        }
        if (!confirm("Are you sure you want to delete this part?")) return;
        
        try {
            await equipmentService.deleteEquipment(vehicleId, id);
            toast.success("Part deleted");
            loadEquipment();
        } catch (error) {
            toast.error("Failed to delete part");
        }
    };

    const handleOpenRepairDialog = (item: EquipmentItem) => {
        setRepairItem(item);
        setRepairNotes('');
        setRepairCost('');
        setRepairMerchant('');
        setRepairDate(new Date().toISOString().split('T')[0]); // Default to today
        setIsRepairDialogOpen(true);
    };

    const handleDeleteDamageReport = async (reportId: string) => {
        if (!editingItem) return;
        if (!confirm("Are you sure you want to delete this damage report? This will recalculate the item's status based on the remaining history.")) return;

        try {
            setIsSubmitting(true);
            
            // Filter out the report
            const currentHistory = editingItem.damageHistory || [];
            const updatedHistory = currentHistory.filter(r => r.id !== reportId);
            
            // Determine new status and notes based on remaining history
            let newStatus: EquipmentStatus = 'Good';
            let newNotes = '';
            
            if (updatedHistory.length > 0) {
                // Sort by date descending to find latest
                const sorted = [...updatedHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const latest = sorted[0];
                
                if (latest.type.includes('Repair')) {
                    newStatus = 'Good';
                } else if (latest.type.includes('Missing')) {
                    newStatus = 'Missing';
                } else {
                    newStatus = 'Damaged';
                }
                
                // Keep the notes relevant to the latest status
                newNotes = latest.description;
            }

            const updatedItem: EquipmentItem = {
                ...editingItem,
                damageHistory: updatedHistory,
                status: newStatus,
                notes: newNotes,
                updatedAt: new Date().toISOString()
            };

            await equipmentService.saveEquipment(updatedItem);
            
            toast.success("Damage report deleted");
            
            // Update local state immediately
            setEditingItem(updatedItem);
            setFormData(prev => ({
                ...prev,
                status: newStatus,
                notes: newNotes
            }));

            loadEquipment();
        } catch (error) {
            console.error(error);
            toast.error("Failed to delete damage report");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRepairSubmit = async () => {
        if (!repairItem) return;

        try {
            setIsSubmitting(true);
            
            // Create repair report
            const repairReport = createDamageReport(
                'Manager', 
                ['Repair'],
                'Cosmetic', 
                repairNotes || 'Marked as repaired by manager',
                [],
                repairCost !== '' ? Number(repairCost) : undefined,
                repairMerchant || undefined,
                repairDate ? new Date(repairDate).toISOString() : undefined
            );

            // Update item
            let updatedItem = { ...repairItem };
            updatedItem = appendDamageHistory(updatedItem, repairReport);
            updatedItem.status = 'Good';
            // Update notes to reflect latest status
            const costText = repairCost ? ` (Cost: $${repairCost})` : '';
            updatedItem.notes = `Repaired: ${repairNotes || 'No details provided'}${costText}`;

            await equipmentService.saveEquipment(updatedItem);
            
            toast.success("Item marked as repaired");
            setIsRepairDialogOpen(false);
            loadEquipment();
        } catch (error) {
            console.error(error);
            toast.error("Failed to submit repair");
        } finally {
            setIsSubmitting(false);
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
                <h3 className="text-lg font-medium">Exterior Parts</h3>
                <Button onClick={() => handleOpenDialog()}>
                    <Plus className="w-4 h-4 mr-2" /> Add Part
                </Button>
            </div>

            <div className="space-y-4">
                {items.length === 0 ? (
                    <div className="border rounded-md p-8 text-center text-muted-foreground bg-slate-50">
                        No exterior parts tracked for this vehicle.
                    </div>
                ) : (
                    Object.entries(groupedItems).map(([section, sectionItems]) => {
                        if (sectionItems.length === 0) return null;
                        
                        return (
                            <Collapsible key={section} defaultOpen={false} className="border rounded-md bg-white overflow-hidden">
                                <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-slate-50 transition-colors group">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold text-sm text-slate-800">{section}</h4>
                                        <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600">{sectionItems.length}</Badge>
                                        
                                        {sectionItems.some(i => ['Damaged', 'Missing', 'Maintenance'].includes(i.status)) && (
                                            <Badge variant="destructive" className="text-[10px] h-5 px-1.5 ml-2">
                                                {sectionItems.filter(i => ['Damaged', 'Missing', 'Maintenance'].includes(i.status)).length} Issues
                                            </Badge>
                                        )}
                                    </div>
                                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="border-t">
                                        <Table>
                                            <TableHeader className="bg-slate-50/50">
                                                <TableRow>
                                                    <TableHead className="w-[35%]">Part Name</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead className="text-right">Value</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {sectionItems.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell>
                                                            <div className="font-medium">{item.name}</div>
                                                            {item.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</div>}
                                                            {item.subItems && item.subItems.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 mt-1">
                                                                    {item.subItems.map(sub => (
                                                                        <Badge key={sub.id} variant="outline" className="text-[10px] px-1 py-0 h-5">
                                                                            + {sub.name}
                                                                        </Badge>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {item.notes && (
                                                                <div className="text-[10px] text-amber-600 mt-1 flex items-start gap-1">
                                                                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> 
                                                                    <span className="line-clamp-2">{item.notes}</span>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                                                        <TableCell className="text-xs text-muted-foreground">{item.purchaseDate || '-'}</TableCell>
                                                        <TableCell className="text-right text-sm">
                                                            <div>{item.price ? `$${Number(item.price).toLocaleString()}` : '-'}</div>
                                                            {item.shippingCost ? (
                                                                <div className="text-[10px] text-muted-foreground">
                                                                    +${Number(item.shippingCost).toLocaleString()}
                                                                </div>
                                                            ) : null}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-1">
                                                                {(item.status === 'Damaged' || item.status === 'Missing') && (
                                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenRepairDialog(item)} className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" title="Mark as Repaired">
                                                                        <Wrench className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                )}
                                                                <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(item)} className="h-8 w-8">
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="h-8 w-8 text-slate-400 hover:text-destructive">
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        );
                    })
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingItem ? 'Edit Exterior Part' : 'Add Exterior Part'}</DialogTitle>
                        <DialogDescription>
                            {editingItem ? 'Update the details of the exterior part.' : 'Track a new exterior part or damage point.'}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="grid grid-cols-2 gap-4 py-4">
                        <div className="col-span-2 space-y-2">
                            <Label htmlFor="name">Part Name</Label>
                            <Input 
                                id="name" 
                                value={formData.name} 
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                placeholder="e.g. Front Bumper, Left Side Mirror"
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="status">Condition</Label>
                            <Select 
                                value={formData.status} 
                                onValueChange={(val: EquipmentStatus) => setFormData({...formData, status: val})}
                            >
                                <SelectTrigger id="status">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="New">New / Perfect</SelectItem>
                                    <SelectItem value="Good">Good</SelectItem>
                                    <SelectItem value="Damaged">Damaged / Scratched</SelectItem>
                                    <SelectItem value="Missing">Missing / Broken</SelectItem>
                                    <SelectItem value="Maintenance">Maintenance / Repair</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="purchaseDate">Installation/Check Date</Label>
                            <Input 
                                id="purchaseDate" 
                                type="date"
                                value={formData.purchaseDate} 
                                onChange={(e) => setFormData({...formData, purchaseDate: e.target.value})}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="price">Replacement Value ($)</Label>
                            <Input 
                                id="price" 
                                type="number"
                                value={formData.price} 
                                onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="shippingCost">Labor/Shipping Cost ($)</Label>
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
                                placeholder="Details about the part, color, material..."
                                className="h-20"
                            />
                        </div>

                        {/* Sub Items Section - kept for flexibility, maybe 'clips', 'screws' etc. */}
                        <div className="col-span-2 border-t pt-4 mt-2">
                            <div className="flex justify-between items-center mb-3">
                                <Label className="font-semibold text-sm">Components / Fixings</Label>
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
                                        <div className="col-span-7">Name</div>
                                        <div className="col-span-4">Cost</div>
                                        <div className="col-span-1"></div>
                                    </div>
                                    {formData.subItems?.map((sub, index) => (
                                        <div key={sub.id} className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-7">
                                                <Input 
                                                    placeholder="e.g. Clips" 
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
                                    No sub-components added.
                                </div>
                            )}
                        </div>

                        {formData.status && ['Damaged', 'Missing', 'Maintenance'].includes(formData.status) && (
                             <div className="col-span-2 space-y-2 mt-2">
                                <Label>Common Issues</Label>
                                <div className="flex flex-wrap gap-2">
                                    {DAMAGE_TYPES.map(type => (
                                        <Badge 
                                            key={type} 
                                            variant="outline" 
                                            className="cursor-pointer hover:bg-slate-100"
                                            onClick={() => {
                                                const current = formData.notes || '';
                                                setFormData({
                                                    ...formData, 
                                                    notes: current ? `${current}, ${type}` : type
                                                });
                                            }}
                                        >
                                            + {type}
                                        </Badge>
                                    ))}
                                </div>
                             </div>
                        )}

                        <div className="col-span-2 space-y-2 mt-2">
                            <Label htmlFor="notes">Damage / Condition Notes</Label>
                            <Textarea 
                                id="notes" 
                                value={formData.notes} 
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                placeholder="Describe any scratches, dents, or previous repairs..."
                                className="h-20"
                            />
                        </div>

                        {editingItem && (
                            <div className="col-span-2 space-y-2 mt-4 pt-4 border-t">
                                <Label className="text-base font-semibold text-slate-900">Damage History</Label>
                                <DamageHistoryTimeline history={editingItem.damageHistory} onDelete={handleDeleteDamageReport} />
                            </div>
                        )}
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

            <Dialog open={isRepairDialogOpen} onOpenChange={setIsRepairDialogOpen}>
                <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Mark as Repaired</DialogTitle>
                        <DialogDescription>
                            Confirm that {repairItem?.name} has been repaired or replaced. This will reset the status to 'Good'.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="repairDate">Date</Label>
                                <Input
                                    id="repairDate"
                                    type="date"
                                    value={repairDate}
                                    onChange={(e) => setRepairDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="repairCost">Cost ($)</Label>
                                <Input
                                    id="repairCost"
                                    type="number"
                                    value={repairCost}
                                    onChange={(e) => setRepairCost(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="repairMerchant">Merchant / Provider</Label>
                            <Input
                                id="repairMerchant"
                                value={repairMerchant}
                                onChange={(e) => setRepairMerchant(e.target.value)}
                                placeholder="e.g. Mechanic Shop A"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="repairNotes">Repair Notes</Label>
                            <Textarea 
                                id="repairNotes" 
                                value={repairNotes} 
                                onChange={(e) => setRepairNotes(e.target.value)}
                                placeholder="Details about the repair performed..."
                                className="mt-2"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRepairDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleRepairSubmit} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Repair
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export const ExteriorManager = React.memo(ExteriorManagerComponent);
