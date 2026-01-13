import React, { useState } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "../ui/table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuLabel, 
    DropdownMenuSeparator, 
    DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { Search, MoreHorizontal, Pencil, Trash2, Fuel, CreditCard, Banknote } from "lucide-react";
import { FuelEntry } from '../../types/fuel';

interface FuelLogTableProps {
    entries: FuelEntry[];
    onEdit: (entry: FuelEntry) => void;
    onDelete: (id: string) => void;
    getVehicleName: (id?: string) => string;
    getDriverName: (id?: string) => string;
}

export function FuelLogTable({ entries, onEdit, onDelete, getVehicleName, getDriverName }: FuelLogTableProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredEntries = entries.filter(entry => 
        getVehicleName(entry.vehicleId).toLowerCase().includes(searchTerm.toLowerCase()) ||
        getDriverName(entry.driverId).toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.stationAddress?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getTypeIcon = (type: string) => {
        switch(type) {
            case 'Card_Transaction': return <CreditCard className="h-4 w-4 text-indigo-500" />;
            case 'Manual_Entry': return <Banknote className="h-4 w-4 text-emerald-500" />;
            default: return <Fuel className="h-4 w-4 text-slate-500" />;
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        // Fix for timezone offset issue with YYYY-MM-DD strings
        // "2026-01-08" -> UTC Midnight -> Previous day in EST
        // We parse manually to ensure it displays as the intended local date
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            const [year, month, day] = dateString.split('-').map(Number);
            return new Date(year, month - 1, day).toLocaleDateString();
        }
        return new Date(dateString).toLocaleDateString();
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="relative w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                    <Input 
                        placeholder="Search logs..." 
                        className="pl-8" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="text-sm text-slate-500">
                    Showing {filteredEntries.length} entries
                </div>
            </div>

            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Vehicle</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Volume (L)</TableHead>
                            <TableHead>Cost ($)</TableHead>
                            <TableHead>Odometer</TableHead>
                            <TableHead>Gas Station</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEntries.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                                    No logs found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredEntries.map((entry) => (
                                <TableRow key={entry.id}>
                                    <TableCell>
                                        {formatDate(entry.date)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2" title={entry.type}>
                                            {getTypeIcon(entry.type)}
                                            <span className="hidden md:inline text-xs font-medium text-slate-600">
                                                {entry.type.replace('_', ' ')}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {getVehicleName(entry.vehicleId)}
                                    </TableCell>
                                    <TableCell>
                                        {getDriverName(entry.driverId)}
                                    </TableCell>
                                    <TableCell>
                                        {entry.liters?.toFixed(1)} L
                                    </TableCell>
                                    <TableCell className="font-semibold text-slate-900">
                                        ${entry.amount.toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                        {entry.odometer?.toLocaleString()} km
                                    </TableCell>
                                    <TableCell className="max-w-[150px] truncate">
                                        <div className="flex flex-col">
                                            <span className="font-medium truncate" title={entry.location}>{entry.location || '-'}</span>
                                            {entry.stationAddress && (
                                                <span className="text-xs text-slate-500 truncate" title={entry.stationAddress}>
                                                    {entry.stationAddress}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <span className="sr-only">Open menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => onEdit(entry)}>
                                                    <Pencil className="mr-2 h-4 w-4" /> Edit Entry
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-rose-600" onClick={() => onDelete(entry.id)}>
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Entry
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
