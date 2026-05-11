import React, { useState, useMemo } from 'react';
// cache-bust: v1.0.3 - Explicitly standardizing Badge import
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { ScrollArea } from '../../ui/scroll-area';
import { Checkbox } from '../../ui/checkbox';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Search, Trash2, AlertTriangle, MapPin } from 'lucide-react';
import { StationOverride } from '../../../types/station';

interface BulkDeleteStationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stations: Record<string, StationOverride>;
  onDelete: (ids: string[]) => void;
}

export function BulkDeleteStationsModal({ 
  isOpen, 
  onClose, 
  stations, 
  onDelete 
}: BulkDeleteStationsModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  // Convert Record to Array for easier handling
  const stationList = useMemo(() => {
    return Object.entries(stations).map(([id, data]) => ({
      id,
      ...data
    }));
  }, [stations]);

  // Filter based on search
  const filteredStations = useMemo(() => {
    if (!searchTerm) return stationList;
    const lower = searchTerm.toLowerCase();
    return stationList.filter(s => 
      s.name.toLowerCase().includes(lower) || 
      s.address.toLowerCase().includes(lower)
    );
  }, [stationList, searchTerm]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Select all currently filtered
      setSelectedIds(new Set(filteredStations.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const handleConfirmDelete = () => {
    onDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
    onClose();
  };

  const allSelected = filteredStations.length > 0 && filteredStations.every(s => selectedIds.has(s.id));
  const isIndeterminate = filteredStations.some(s => selectedIds.has(s.id)) && !allSelected;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" />
            Bulk Delete Stations
          </DialogTitle>
          <DialogDescription>
            Select the stations you want to permanently remove. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search stations to delete..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* List Header / Select All */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <Checkbox 
              checked={allSelected ? true : isIndeterminate ? "indeterminate" : false}
              onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
            />
            <span className="text-sm font-medium text-slate-700">
              {selectedIds.size} selected
            </span>
            {stationList.length === 0 && (
                <span className="text-xs text-slate-500 ml-auto">No custom stations found</span>
            )}
          </div>

          {/* Station List */}
          <ScrollArea className="flex-1 border border-slate-200 rounded-md">
             {filteredStations.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                     <p className="text-sm">No matching stations found.</p>
                 </div>
             ) : (
                 <div className="divide-y divide-slate-100">
                    {filteredStations.map((station) => (
                        <div 
                            key={station.id} 
                            className="flex items-start gap-3 p-3 hover:bg-slate-50 transition-colors"
                        >
                            <Checkbox 
                                id={`station-${station.id}`}
                                className="mt-1"
                                checked={selectedIds.has(station.id)}
                                onCheckedChange={(checked) => handleSelectOne(station.id, checked as boolean)}
                            />
                            <div className="grid gap-1 flex-1">
                                <label 
                                    htmlFor={`station-${station.id}`}
                                    className="text-sm font-medium text-slate-900 cursor-pointer"
                                >
                                    {station.name}
                                </label>
                                <div className="flex items-center gap-1 text-xs text-slate-500">
                                    <MapPin className="h-3 w-3" />
                                    <span className="truncate max-w-[350px]">{station.address}</span>
                                </div>
                                <div className="flex gap-2 mt-1">
                                    <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal bg-white">
                                        {station.brand || 'Unknown Brand'}
                                    </Badge>
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1 font-normal text-slate-500">
                                        {station.dataSource === 'import' ? 'Imported' : 'Manual'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    ))}
                 </div>
             )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleConfirmDelete}
            disabled={selectedIds.size === 0}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete {selectedIds.size} Stations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
