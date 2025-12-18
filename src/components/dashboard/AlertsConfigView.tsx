import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { AlertRule } from '../../types/data';
import { api } from '../../services/api';
import { toast } from "sonner@2.0.3";
import { Plus, Trash2, Settings } from 'lucide-react';
import { Badge } from "../ui/badge";

export function AlertsConfigView() {
    const [rules, setRules] = useState<AlertRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    
    // New Rule State
    const [newRule, setNewRule] = useState<Partial<AlertRule>>({
        name: '',
        metric: 'cancellation_rate',
        condition: 'gt',
        threshold: 0,
        severity: 'warning',
        enabled: true
    });

    useEffect(() => {
        loadRules();
    }, []);

    const loadRules = async () => {
        try {
            setLoading(true);
            const data = await api.getAlertRules();
            setRules(data);
        } catch (e) {
            console.error(e);
            toast.error("Failed to load alert rules");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            if (!newRule.name) return toast.error("Name is required");
            
            await api.saveAlertRule({ 
                ...newRule, 
                id: crypto.randomUUID(),
                threshold: Number(newRule.threshold) 
            });
            toast.success("Rule saved");
            setIsDialogOpen(false);
            loadRules();
            // Reset form
            setNewRule({
                name: '',
                metric: 'cancellation_rate',
                condition: 'gt',
                threshold: 0,
                severity: 'warning',
                enabled: true
            });
        } catch (e) {
            toast.error("Failed to save rule");
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.deleteAlertRule(id);
            toast.success("Rule deleted");
            loadRules();
        } catch (e) {
            toast.error("Failed to delete rule");
        }
    };

    const toggleRule = async (rule: AlertRule) => {
         try {
            await api.saveAlertRule({ ...rule, enabled: !rule.enabled });
            loadRules(); 
        } catch (e) {
            toast.error("Failed to update rule");
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-slate-500" />
                    Alert Rules Configuration
                </CardTitle>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Add Rule</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Alert Rule</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Rule Name</Label>
                                <Input value={newRule.name} onChange={e => setNewRule({...newRule, name: e.target.value})} placeholder="e.g. High Cancellations" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Metric</Label>
                                    <Select value={newRule.metric} onValueChange={(v: any) => setNewRule({...newRule, metric: v})}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="cancellation_rate">Cancellation Rate (%)</SelectItem>
                                            <SelectItem value="acceptance_rate">Acceptance Rate (%)</SelectItem>
                                            <SelectItem value="rating">Rating (1-5)</SelectItem>
                                            <SelectItem value="utilization">Utilization (%)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Severity</Label>
                                    <Select value={newRule.severity} onValueChange={(v: any) => setNewRule({...newRule, severity: v})}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="info">Info</SelectItem>
                                            <SelectItem value="warning">Warning</SelectItem>
                                            <SelectItem value="critical">Critical</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Condition</Label>
                                    <Select value={newRule.condition} onValueChange={(v: any) => setNewRule({...newRule, condition: v})}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="gt">Greater Than ({'>'})</SelectItem>
                                            <SelectItem value="lt">Less Than ({'<'})</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Threshold</Label>
                                    <Input type="number" value={newRule.threshold} onChange={e => setNewRule({...newRule, threshold: e.target.value})} />
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleSave}>Save Rule</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[80px]">Status</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Condition</TableHead>
                            <TableHead>Severity</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rules.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-8">No custom rules configured.</TableCell></TableRow>}
                        {rules.map(rule => (
                            <TableRow key={rule.id}>
                                <TableCell>
                                    <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule)} />
                                </TableCell>
                                <TableCell className="font-medium">{rule.name}</TableCell>
                                <TableCell>
                                    <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                                        {rule.metric} {rule.condition === 'gt' ? '>' : '<'} {rule.threshold}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={rule.severity === 'critical' ? 'destructive' : rule.severity === 'warning' ? 'secondary' : 'outline'}>
                                        {rule.severity}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
                                        <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
