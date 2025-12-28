import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { format } from "date-fns";
import { Trip, FinancialTransaction } from "../../../types/data";
import { Search, Loader2 } from "lucide-react";

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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Find Trip for Toll Transaction</DialogTitle>
          <DialogDescription>
             Match the toll charge of <strong>${Math.abs(transaction.amount).toFixed(2)}</strong> on {format(new Date(transaction.date), 'MMM d, h:mm a')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                <Input 
                    placeholder="Search by date (YYYY-MM-DD), driver name, or ID..." 
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="pl-9"
                />
            </div>

            <div className="border rounded-md max-h-[400px] overflow-y-auto">
                <Table>
                    <TableHeader className="bg-slate-50 sticky top-0">
                        <TableRow>
                            <TableHead>Date & Time</TableHead>
                            <TableHead>Platform</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Route</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {searching ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                                </TableCell>
                            </TableRow>
                        ) : filteredTrips.length === 0 ? (
                             <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                    No trips found matching "{searchTerm}"
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredTrips.map(trip => (
                                <TableRow key={trip.id}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{format(new Date(trip.date), 'MMM d, yyyy')}</span>
                                            <span className="text-xs text-slate-500">{format(new Date(trip.date), 'h:mm a')}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{trip.platform}</Badge>
                                    </TableCell>
                                    <TableCell>{trip.driverName}</TableCell>
                                    <TableCell className="max-w-[200px] truncate text-xs text-slate-600">
                                        {trip.pickupLocation} → {trip.dropoffLocation}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm" onClick={() => onConfirmMatch(trip)}>
                                            Select
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
