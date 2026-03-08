import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { format } from "date-fns";
import { Trip, FinancialTransaction } from "../../../types/data";
import { normalizePlatform } from '../../../utils/normalizePlatform';
import { Search, Loader2, MapPin, User, Car } from "lucide-react";

interface ManualMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: FinancialTransaction | null;
  allTrips: Trip[];
  onConfirmMatch: (trip: Trip) => void;
}

export function ManualMatchModal({ isOpen, onClose, transaction, allTrips, onConfirmMatch }: ManualMatchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (isOpen && transaction) {
      // Default search: Trips on the same day
      const txDate = transaction.date.split('T')[0]; // Extract YYYY-MM-DD
      setSearchTerm(txDate);
      filterTrips(txDate);
    } else {
        setSearchTerm('');
        setFilteredTrips([]);
    }
  }, [isOpen, transaction]);

  const filterTrips = (term: string) => {
    setSearching(true);
    // Simulate delay for realism or heavy filtering
    setTimeout(() => {
        const lowerTerm = term.toLowerCase();
        const results = allTrips.filter(t => {
            // Match Date
            if (t.date.includes(term)) return true;
            // Match Driver
            if (t.driverName?.toLowerCase().includes(lowerTerm)) return true;
            // Match Vehicle (if trip has it)
            if (t.vehicleId?.toLowerCase().includes(lowerTerm)) return true;
            // Match ID
            if (t.id.toLowerCase().includes(lowerTerm)) return true;
            return false;
        });

        // Sort by date closest to transaction if possible
        if (transaction) {
            const txTime = new Date(transaction.date).getTime();
            results.sort((a, b) => {
                const diffA = Math.abs(new Date(a.date).getTime() - txTime);
                const diffB = Math.abs(new Date(b.date).getTime() - txTime);
                return diffA - diffB;
            });
        }
        
        setFilteredTrips(results.slice(0, 50)); // Limit to 50
        setSearching(false);
    }, 300);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    filterTrips(e.target.value);
  };

  if (!transaction) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-white">
          <DialogTitle className="text-xl">Find Trip for Toll Transaction</DialogTitle>
          <DialogDescription className="mt-1">
             Match the toll charge of <strong className="text-slate-900">${Math.abs(transaction.amount).toFixed(2)}</strong> on {format(new Date(transaction.date), 'MMM d, h:mm a')}
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 bg-slate-50 border-b">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input 
                    placeholder="Search by date (YYYY-MM-DD), driver name, or ID..." 
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="pl-9 bg-white border-slate-200"
                />
            </div>
        </div>

        <div className="max-h-[500px] overflow-auto bg-white">
            <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <TableRow>
                        <TableHead className="w-[180px]">Date & Time</TableHead>
                        <TableHead className="w-[100px]">Platform</TableHead>
                        <TableHead className="w-[150px]">Driver</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead className="text-right w-[100px]">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {searching ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-12">
                                <div className="flex flex-col items-center justify-center text-slate-500">
                                    <Loader2 className="h-8 w-8 animate-spin mb-2 text-indigo-600" />
                                    <p>Searching trips...</p>
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : filteredTrips.length === 0 ? (
                         <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                                <p className="text-lg font-medium text-slate-900 mb-1">No trips found</p>
                                <p>Try searching for a different date or driver name.</p>
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredTrips.map(trip => (
                            <TableRow key={trip.id} className="hover:bg-slate-50 group">
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium text-slate-900">{format(new Date(trip.date), 'MMM d, yyyy')}</span>
                                        <span className="text-xs text-slate-500">{format(new Date(trip.date), 'h:mm a')}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="bg-white whitespace-nowrap">{normalizePlatform(trip.platform)}</Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                            <User className="h-3 w-3" />
                                        </div>
                                        <span className="text-sm font-medium text-slate-700 truncate max-w-[120px]" title={trip.driverName}>
                                            {trip.driverName}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1 max-w-[300px]">
                                        <div className="flex items-start gap-1.5 text-xs text-slate-600">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                                            <span className="truncate" title={trip.pickupLocation}>{trip.pickupLocation}</span>
                                        </div>
                                        <div className="flex items-start gap-1.5 text-xs text-slate-600">
                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                                            <span className="truncate" title={trip.dropoffLocation}>{trip.dropoffLocation}</span>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" onClick={() => onConfirmMatch(trip)} className="bg-slate-900 hover:bg-slate-800 text-white">
                                        Select
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
        
        <DialogFooter className="p-4 border-t bg-slate-50 sm:justify-between items-center">
            <div className="text-xs text-slate-500">
                Showing {filteredTrips.length} potential matches
            </div>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}