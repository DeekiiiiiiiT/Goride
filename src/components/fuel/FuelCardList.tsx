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
import { Search, MoreHorizontal, Pencil, Trash2, CreditCard, User, Car } from "lucide-react";
import { FuelCard } from '../../types/fuel';

interface FuelCardListProps {
    cards: FuelCard[];
    onEdit: (card: FuelCard) => void;
    onDelete: (cardId: string) => void;
    getVehicleName: (id?: string) => string;
    getDriverName: (id?: string) => string;
}

export function FuelCardList({ cards, onEdit, onDelete, getVehicleName, getDriverName }: FuelCardListProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredCards = cards.filter(card => 
        card.cardNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        card.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getVehicleName(card.assignedVehicleId).toLowerCase().includes(searchTerm.toLowerCase()) ||
        getDriverName(card.assignedDriverId).toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="relative w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                    <Input 
                        placeholder="Search cards..." 
                        className="pl-8" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Provider</TableHead>
                            <TableHead>Card Number</TableHead>
                            <TableHead>Assigned To</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Expiry</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredCards.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                                    No cards found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredCards.map((card) => (
                                <TableRow key={card.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                                                <CreditCard className="h-4 w-4" />
                                            </div>
                                            {card.provider}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono">{card.cardNumber}</TableCell>
                                    <TableCell>
                                        {card.assignedVehicleId ? (
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <Car className="h-3.5 w-3.5 text-slate-400" />
                                                <span>{getVehicleName(card.assignedVehicleId)}</span>
                                            </div>
                                        ) : card.assignedDriverId ? (
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <User className="h-3.5 w-3.5 text-slate-400" />
                                                <span>{getDriverName(card.assignedDriverId)}</span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 text-xs italic">Unassigned</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            card.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            card.status === 'Lost' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                            'bg-slate-50 text-slate-700'
                                        }>
                                            {card.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {card.expiryDate ? new Date(card.expiryDate).toLocaleDateString() : '-'}
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
                                                <DropdownMenuItem onClick={() => onEdit(card)}>
                                                    <Pencil className="mr-2 h-4 w-4" /> Edit Details
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-rose-600" onClick={() => onDelete(card.id)}>
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Card
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
