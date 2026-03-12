import React, { useState } from 'react';
import { Trip, DriverMetrics, VehicleMetrics, ImportAuditState } from '../../types/data';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { CheckCircle, AlertCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, Edit2, Trash2, Check, X } from 'lucide-react';
import { Input } from '../ui/input';

interface QuarantineListProps {
    auditState: ImportAuditState;
    onDismiss: (id: string, type: 'trip' | 'driver' | 'vehicle') => void;
    onExclude: (id: string, type: 'trip' | 'driver' | 'vehicle') => void;
    onSave: (id: string, type: 'trip' | 'driver' | 'vehicle', data: any) => void;
}

export function QuarantineList({ auditState, onDismiss, onExclude, onSave }: QuarantineListProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<any>({});
    
    // Flatten all anomalies
    const tripAnomalies = (auditState?.sanitized?.trips || []).filter(t => (t.issues || []).length > 0 && !t.isExcluded);
    const driverAnomalies = (auditState?.sanitized?.drivers || []).filter(d => (d.issues || []).length > 0 && !d.isExcluded);
    const vehicleAnomalies = (auditState?.sanitized?.vehicles || []).filter(v => (v.issues || []).length > 0 && !v.isExcluded);

    const hasAnomalies = tripAnomalies.length > 0 || driverAnomalies.length > 0 || vehicleAnomalies.length > 0;

    if (!hasAnomalies) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-green-50 border border-green-100 rounded-lg text-center">
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-green-900">All Clear!</h3>
                <p className="text-green-700">No anomalies detected in the current dataset.</p>
            </div>
        );
    }

    const startEdit = (id: string, data: any) => {
        setEditingId(id);
        setEditValues({ ...data });
    };

    const saveEdit = (id: string, type: 'trip' | 'driver' | 'vehicle') => {
        onSave(id, type, editValues);
        setEditingId(null);
        setEditValues({});
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValues({});
    };

    return (
        <div className="space-y-6">
            {/* TRIPS */}
            {tripAnomalies.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                         <AlertTriangle className="h-4 w-4 text-amber-500" />
                         <h3 className="font-medium text-slate-900">Flagged Trips ({tripAnomalies.length})</h3>
                    </div>
                    
                    {/* Desktop Table */}
                    <div className="hidden md:block border rounded-md overflow-hidden bg-white shadow-sm">
                        <Table>
                            <TableHeader className="bg-slate-50/50">
                                <TableRow>
                                    <TableHead className="w-[100px] font-medium text-slate-500">Issue</TableHead>
                                    <TableHead className="font-medium text-slate-500">Date</TableHead>
                                    <TableHead className="font-medium text-slate-500">Driver</TableHead>
                                    <TableHead className="text-right font-medium text-slate-500">Distance</TableHead>
                                    <TableHead className="text-right font-medium text-slate-500">Fare</TableHead>
                                    <TableHead className="text-right font-medium text-slate-500 w-[100px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tripAnomalies.map((item) => {
                                    const isEditing = editingId === item.data.id;
                                    return (
                                        <TableRow key={item.data.id} className="hover:bg-slate-50">
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {item.issues.map((issue, i) => (
                                                        <TooltipProvider key={i}>
                                                            <Tooltip>
                                                                <TooltipTrigger>
                                                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 cursor-help font-normal text-xs px-2 py-0.5">
                                                                        {issue.field || 'Warning'}
                                                                    </Badge>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p>{issue.message}</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-600">
                                                {new Date(item.data.requestTime || item.data.date).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-600 font-medium">
                                                {item.data.driverName || 'Unknown'}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-slate-600">
                                                {isEditing ? (
                                                    <Input 
                                                        type="number" 
                                                        className="h-8 w-20 text-right ml-auto" 
                                                        value={editValues.distance} 
                                                        onChange={(e) => setEditValues({...editValues, distance: parseFloat(e.target.value)})}
                                                    />
                                                ) : (
                                                    `${item.data.distance?.toFixed(1) || 0} km`
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-sm font-semibold text-slate-900">
                                                {isEditing ? (
                                                    <Input 
                                                        type="number" 
                                                        className="h-8 w-24 text-right ml-auto" 
                                                        value={editValues.grossEarnings} 
                                                        onChange={(e) => setEditValues({...editValues, grossEarnings: parseFloat(e.target.value)})}
                                                    />
                                                ) : (
                                                    `$${item.data.grossEarnings?.toFixed(2) || 0}`
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {isEditing ? (
                                                        <>
                                                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => saveEdit(item.data.id, 'trip')}>
                                                                <Check className="h-4 w-4" />
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100" onClick={cancelEdit}>
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                         <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full" onClick={() => startEdit(item.data.id, item.data)}>
                                                                            <Edit2 className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>Edit</TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                            
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full" onClick={() => onDismiss(item.data.id, 'trip')}>
                                                                            <CheckCircle className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>Mark as Safe</TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>

                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full" onClick={() => onExclude(item.data.id, 'trip')}>
                                                                            <Trash2 className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>Delete</TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                         {tripAnomalies.map((item) => (
                             <Card key={item.data.id} className="border-amber-200 bg-amber-50/50">
                                 <CardContent className="p-4 space-y-3">
                                     <div className="flex justify-between items-start">
                                         <div className="flex flex-wrap gap-1">
                                            {item.issues.map((issue, i) => (
                                                <Badge key={i} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                                                    {issue.field || 'Warning'}
                                                </Badge>
                                            ))}
                                         </div>
                                         <div className="text-xs text-slate-500">
                                            {new Date(item.data.requestTime || item.data.date).toLocaleDateString()}
                                         </div>
                                     </div>
                                     
                                     <div className="grid grid-cols-2 gap-2 text-sm">
                                         <div>
                                             <span className="text-slate-500 text-xs block">Distance</span>
                                             <span className="font-mono">{item.data.distance?.toFixed(1) || 0} km</span>
                                         </div>
                                         <div>
                                             <span className="text-slate-500 text-xs block">Earnings</span>
                                             <span className="font-mono">${item.data.grossEarnings?.toFixed(2) || 0}</span>
                                         </div>
                                     </div>

                                     <div className="flex justify-end gap-2 pt-2 border-t border-amber-200/50">
                                         <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onDismiss(item.data.id, 'trip')}>
                                             Dismiss
                                         </Button>
                                         <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => onExclude(item.data.id, 'trip')}>
                                             Exclude
                                         </Button>
                                     </div>
                                 </CardContent>
                             </Card>
                         ))}
                    </div>
                </div>
            )}

            {/* DRIVERS */}
            {driverAnomalies.length > 0 && (
                <div className="space-y-3">
                     <h3 className="font-medium text-slate-900 flex items-center gap-2">
                        <UsersIcon className="h-4 w-4 text-amber-500" />
                        Flagged Drivers ({driverAnomalies.length})
                    </h3>
                    <div className="border rounded-md overflow-hidden bg-white">
                         {driverAnomalies.map((item) => (
                            <div key={item.data.driverId} className="p-4 border-b last:border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-slate-900">{item.data.name}</span>
                                        <Badge variant="outline" className="text-xs">{item.data.driverId}</Badge>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {item.issues.map((issue, i) => (
                                            <span key={i} className="text-xs text-amber-600 flex items-center bg-amber-50 px-2 py-0.5 rounded">
                                                <AlertCircle className="h-3 w-3 mr-1" /> {issue.message}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => onDismiss(item.data.driverId, 'driver')}>Dismiss</Button>
                                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => onExclude(item.data.driverId, 'driver')}>Exclude</Button>
                                </div>
                            </div>
                         ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function UsersIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    )
}