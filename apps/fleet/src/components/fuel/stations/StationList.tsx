// cache-bust: v1.0.3 - Explicitly standardizing Badge import
import React, { useState, useMemo, useEffect } from 'react';
import { StationAnalyticsContextType } from '../../../types/station';
import { StationProfile } from '../../../types/station';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { 
  ArrowUpDown, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  MapPin, 
  ChevronRight, 
  Star, 
  ChevronLeft, 
  ChevronLast, 
  ChevronFirst,
  X,
  History,
  ShieldCheck,
  Trash2,
  Loader2,
  Link
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Checkbox } from '../../ui/checkbox';
import { cn } from '../../ui/utils';
import { BulkAssignModal } from './BulkAssignModal';

type SortKey = 'name' | 'price' | 'visits' | 'date' | 'city' | 'parish' | 'country' | 'brand' | 'address';
type SortDir = 'asc' | 'desc';

interface StationListProps {
  context: StationAnalyticsContextType;
  onSelectStation?: (id: string) => void;
  variant?: 'manager' | 'simple';
  selectable?: boolean;
  onDeleteSelected?: (ids: string[]) => Promise<void>;
  // Bulk Assign props (simple variant only)
  verifiedStations?: StationProfile[];
  stationEntryIds?: Map<string, string[]>;
  onBulkAssignComplete?: () => void;
}

export function StationList({ context, onSelectStation, variant = 'manager', selectable = false, onDeleteSelected, verifiedStations, stationEntryIds, onBulkAssignComplete }: StationListProps) {
  const { stations, regionalStats, updateStationDetails } = context;
  
  // -- State --
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Filters
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [parishFilter, setParishFilter] = useState<string>('all');
  
  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Bulk Assign modal state
  const [bulkAssignTarget, setBulkAssignTarget] = useState<{ entryIds: string[]; groupName: string } | null>(null);

  // -- Derived Data --

  // Extract unique brands for filter
  const brands = useMemo(() => {
    const unique = new Set(stations.map(s => s.brand));
    return Array.from(unique).sort();
  }, [stations]);

  // Extract unique cities for filter
  const cities = useMemo(() => {
    const unique = new Set(stations.map(s => s.city).filter(Boolean));
    return Array.from(unique).sort();
  }, [stations]);

  // Official 14 parishes of Jamaica (hardcoded — the only valid values)
  const parishes = [
    'Clarendon',
    'Hanover',
    'Kingston',
    'Manchester',
    'Portland',
    'St. Andrew',
    'St. Ann',
    'St. Catherine',
    'St. Elizabeth',
    'St. James',
    'St. Mary',
    'St. Thomas',
    'Trelawny',
    'Westmoreland',
  ];

  // Reset pagination when filters change OR when station data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, brandFilter, statusFilter, sourceFilter, cityFilter, parishFilter, stations.length]);

  // Filter and Sort
  const processedStations = useMemo(() => {
    let result = [...stations];

    // 1. Search (Name, Address, City, Parish, Plus Code)
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(lower) || 
        s.address.toLowerCase().includes(lower) ||
        (s.city || '').toLowerCase().includes(lower) ||
        (s.parish || '').toLowerCase().includes(lower) ||
        (s.plusCode || '').toLowerCase().includes(lower)
      );
    }

    // 2. Filter by Brand
    if (brandFilter !== 'all') {
      result = result.filter(s => s.brand === brandFilter);
    }

    // 3. Filter by Status
    if (statusFilter !== 'all') {
      result = result.filter(s => s.status === statusFilter);
    }

    // 4. Filter by Source
    if (sourceFilter !== 'all') {
      result = result.filter(s => s.dataSource === sourceFilter);
    }

    // 5. Filter by City
    if (cityFilter !== 'all') {
      result = result.filter(s => s.city === cityFilter);
    }

    // 6. Filter by Parish
    if (parishFilter !== 'all') {
      result = result.filter(s => s.parish === parishFilter);
    }

    // 7. Sort
    result.sort((a, b) => {
      let valA: any = '', valB: any = '';
      
      switch(sortKey) {
        case 'price':
          valA = a.stats?.lastPrice ?? 0;
          valB = b.stats?.lastPrice ?? 0;
          if (valA === 0) valA = 999999; 
          if (valB === 0) valB = 999999;
          break;
        case 'visits':
          valA = a.stats?.totalVisits ?? 0;
          valB = b.stats?.totalVisits ?? 0;
          break;
        case 'date':
          valA = a.stats?.lastUpdated ? new Date(a.stats.lastUpdated).getTime() : 0;
          valB = b.stats?.lastUpdated ? new Date(b.stats.lastUpdated).getTime() : 0;
          break;
        case 'city':
          valA = (a.city || '').toLowerCase();
          valB = (b.city || '').toLowerCase();
          break;
        case 'parish':
          valA = (a.parish || '').toLowerCase();
          valB = (b.parish || '').toLowerCase();
          break;
        case 'country':
          valA = (a.country || 'Jamaica').toLowerCase();
          valB = (b.country || 'Jamaica').toLowerCase();
          break;
        case 'brand':
          valA = a.brand.toLowerCase();
          valB = b.brand.toLowerCase();
          break;
        case 'address':
          valA = a.address.toLowerCase();
          valB = b.address.toLowerCase();
          break;
        case 'name':
        default:
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [stations, searchTerm, sortKey, sortDir, brandFilter, statusFilter, sourceFilter, cityFilter, parishFilter]);

  // Pagination Logic
  const totalItems = processedStations.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = processedStations.slice(startIndex, endIndex);

  // -- Handlers --

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const getPriceColor = (price: number) => {
    if (price <= 0) return 'text-slate-400';
    if (price <= regionalStats.minPrice * 1.01) return 'text-emerald-600 font-bold';
    if (price >= regionalStats.maxPrice * 0.99) return 'text-red-600 font-bold';
    return 'text-slate-900';
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setBrandFilter('all');
    setStatusFilter('all');
    setSourceFilter('all');
    setCityFilter('all');
    setParishFilter('all');
  };

  const hasActiveFilters = searchTerm || brandFilter !== 'all' || statusFilter !== 'all' || sourceFilter !== 'all' || cityFilter !== 'all' || parishFilter !== 'all';

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(stations.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectStation = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const deleteSelectedStations = async () => {
    if (!onDeleteSelected) return;
    setIsDeleting(true);
    try {
      await onDeleteSelected(Array.from(selectedIds));
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Error deleting stations:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* --- Filter Bar (Manager Mode Only) --- */}
      {variant === 'manager' && (
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3">
          {/* Top Row: Search & Primary Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search stations, cities, parishes..." 
                className="pl-9 bg-slate-50 border-slate-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="w-[140px] bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="unverified">Unverified</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="learnt">Learnt</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[130px] bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="log">Logs</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="import">Imported</SelectItem>
                </SelectContent>
              </Select>

              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="w-[130px] bg-slate-50 border-slate-200">
                  <SelectValue placeholder="City" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {cities.map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={parishFilter} onValueChange={setParishFilter}>
                <SelectTrigger className="w-[130px] bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Parish" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parishes</SelectItem>
                  {parishes.map(parish => (
                    <SelectItem key={parish} value={parish}>{parish}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Active Filter Summary (if any) */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                Found <span className="font-semibold text-slate-900">{totalItems}</span> matching stations
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearAllFilters}
                className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <X className="h-3 w-3 mr-1" /> Clear Filters
              </Button>
            </div>
          )}
        </div>
      )}

      {/* --- Simple Mode Search --- */}
      {variant === 'simple' && (
         <div className="flex items-center gap-4 bg-white p-1 rounded-lg">
            <div className="relative w-full sm:w-72">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
               <Input 
                  placeholder="Search stations..." 
                  className="pl-9 bg-slate-50 border-slate-200"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>
            {context.loading && (
              <div className="flex items-center gap-1.5 text-xs text-indigo-600 animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
         </div>
      )}

      {/* --- Table --- */}
      <div className="rounded-md border border-slate-200 overflow-hidden bg-white shadow-sm">
        {/* --- Selection Action Bar --- */}
        {selectable && selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-red-50 border-b border-red-200">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-red-800">
                {selectedIds.size} station{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-slate-500 hover:text-slate-700"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs gap-1.5"
              onClick={deleteSelectedStations}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete {selectedIds.size} Station{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          </div>
        )}

        <Table>
          <TableHeader className="bg-slate-50/75">
            <TableRow>
              {variant === 'manager' ? (
                <>
                  {/* Checkbox column header */}
                  {selectable && (
                    <TableHead className="w-[40px] px-3">
                      <Checkbox
                        checked={stations.length > 0 && selectedIds.size === stations.length}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                        aria-label="Select all stations"
                        className="border-slate-300"
                      />
                    </TableHead>
                  )}
                  {/* Manager Columns: Main Brand, Vendor Name, Address, City, Parish, Telephone */}
                  <TableHead className="w-[150px] cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('brand')}>
                    <div className="flex items-center gap-2">
                      Parent Company
                      {sortKey === 'brand' && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="w-[200px] cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('name')}>
                     <div className="flex items-center gap-2">
                        Gas Station Name
                        {sortKey === 'name' && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                     </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('address')}>
                    <div className="flex items-center gap-2">
                      Street Address
                      {sortKey === 'address' && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('city')}>
                    <div className="flex items-center gap-2">
                      City
                      {sortKey === 'city' && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('parish')}>
                    <div className="flex items-center gap-2">
                      Parish
                      {sortKey === 'parish' && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('country')}>
                    <div className="flex items-center gap-2">
                      Country
                      {sortKey === 'country' && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                    </div>
                  </TableHead>
                  <TableHead>Telephone</TableHead>
                  <TableHead className="w-[100px] text-right">Audit</TableHead>
                </>
              ) : (
                <>
                  {/* Simple View Columns */}
                  <TableHead className="w-[300px] cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('name')}>
                    <div className="flex items-center gap-2">
                      Station Details
                      {sortKey === 'name' && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Brand</TableHead>
                  <TableHead className="cursor-pointer hover:text-slate-900 text-right transition-colors" onClick={() => toggleSort('price')}>
                    <div className="flex items-center justify-end gap-2">
                      Price
                      {sortKey === 'price' && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="text-center w-[80px] hidden sm:table-cell">Trend</TableHead>
                  <TableHead className="cursor-pointer hover:text-slate-900 text-right hidden xl:table-cell transition-colors" onClick={() => toggleSort('visits')}>
                     <div className="flex items-center justify-end gap-2">
                      Visits
                      {sortKey === 'visits' && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-slate-900 text-right hidden md:table-cell transition-colors" onClick={() => toggleSort('date')}>
                     <div className="flex items-center justify-end gap-2">
                      Updated
                      {sortKey === 'date' && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                    </div>
                  </TableHead>
                </>
              )}
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={variant === 'manager' ? (selectable ? 10 : 9) : 7} className="text-center py-16 text-slate-500">
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-slate-50 p-3 rounded-full">
                       {variant === 'simple' && !hasActiveFilters ? (
                          <History className="h-6 w-6 text-slate-300" />
                       ) : (
                          <Search className="h-6 w-6 text-slate-300" />
                       )}
                    </div>
                    <p className="font-medium">
                      {variant === 'simple' && !hasActiveFilters 
                        ? "No Purchase History" 
                        : "No stations found"}
                    </p>
                    <p className="text-xs">
                       {variant === 'manager' 
                         ? "Try adjusting your filters, or Import CSV to add stations." 
                         : hasActiveFilters 
                            ? "No stations match your search."
                            : "No fuel purchases recorded yet. Add fuel logs to see data here."}
                    </p>
                    {variant === 'manager' && hasActiveFilters && (
                        <Button variant="outline" size="sm" onClick={clearAllFilters} className="mt-2">
                          Clear Filters
                        </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              currentItems.map((station) => (
                <TableRow 
                  key={station.id} 
                  className={cn(
                    "group hover:bg-slate-50/80 transition-colors cursor-pointer",
                    selectable && selectedIds.has(station.id) && "bg-red-50/50 hover:bg-red-50/70"
                  )}
                  onClick={() => onSelectStation?.(station.id)}
                >
                  {variant === 'manager' ? (
                    <>
                      {/* Checkbox cell */}
                      {selectable && (
                        <TableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(station.id)}
                            onCheckedChange={(checked) => handleSelectStation(station.id, !!checked)}
                            aria-label={`Select ${station.name}`}
                            className="border-slate-300"
                          />
                        </TableCell>
                      )}
                      {/* Manager Mode Cells */}
                      <TableCell>
                         <span className="font-semibold text-slate-900">{station.brand}</span>
                      </TableCell>
                      <TableCell>
                         <div className="flex flex-col">
                           <div className="flex items-center gap-2">
                             <span className="text-sm font-medium text-slate-900">{station.name}</span>
                             {station.status === 'verified' && <ShieldCheck className="h-3 w-3 text-blue-500" />}
                           </div>
                           {station.status === 'inactive' && <Badge variant="destructive" className="w-fit mt-1 h-4 px-1 text-[9px]">Inactive</Badge>}
                           {station.status === 'learnt' && <Badge variant="outline" className="w-fit mt-1 h-4 px-1 text-[9px] text-amber-600 border-amber-200 bg-amber-50">Learnt</Badge>}
                         </div>
                      </TableCell>
                      <TableCell>
                         <div className="flex items-center gap-1.5 text-sm text-slate-600">
                           <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                           <span title={station.address} className="truncate max-w-[200px]">{station.address}</span>
                         </div>
                      </TableCell>
                      <TableCell>
                         <span className="text-sm text-slate-600">{station.city || '-'}</span>
                      </TableCell>
                      <TableCell>
                         <span className="text-sm text-slate-600">{station.parish || '-'}</span>
                      </TableCell>
                      <TableCell>
                         <span className="text-sm text-slate-600">{station.country || 'Jamaica'}</span>
                      </TableCell>
                      <TableCell>
                         <span className="text-sm text-slate-500">{station.contactInfo?.phone || '-'}</span>
                      </TableCell>
                      <TableCell className="text-right">
                         {station.status === 'unverified' && updateStationDetails && (
                           <Button 
                             size="sm" 
                             variant="outline" 
                             className="h-7 py-0 px-2 text-[10px] bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 hover:border-emerald-300 transition-all font-semibold"
                             onClick={(e) => {
                               e.stopPropagation();
                               updateStationDetails(station.id, { 
                                 status: 'verified',
                                 dataSource: 'manual' // Mark as manually verified
                               });
                             }}
                           >
                             <ShieldCheck className="h-3 w-3 mr-1" />
                             Promote
                           </Button>
                         )}
                         {station.status === 'verified' && (
                           <Badge variant="outline" className="h-5 px-1.5 text-[9px] border-blue-200 text-blue-600 bg-blue-50">
                             Verified
                           </Badge>
                         )}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      {/* Simple Mode Cells */}
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{station.name}</span>
                            {station.isPreferred && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
                            {station.status === 'verified' && (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[9px] h-4 px-1.5 flex items-center gap-1">
                                <ShieldCheck className="h-2.5 w-2.5" />
                                Verified
                              </Badge>
                            )}
                            {station.status === 'learnt' && (
                              <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-[9px] h-4 px-1.5">
                                Learnt
                              </Badge>
                            )}
                            {station.status === 'anomaly' && (
                              <Badge variant="destructive" className="text-[9px] h-4 px-1.5">
                                Anomaly
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate max-w-[200px]" title={station.address}>{station.address}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="font-normal bg-white whitespace-nowrap">
                          {station.brand}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {(station.stats?.lastPrice ?? 0) > 0 ? (
                           <span className={getPriceColor(station.stats!.lastPrice)}>
                             ${station.stats!.lastPrice.toFixed(2)}
                           </span>
                        ) : (
                           <span className="text-slate-400 italic text-xs">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        <div className="flex items-center justify-center">
                            {station.stats?.priceTrend === 'Up' && <TrendingUp className="h-4 w-4 text-red-500" />}
                            {station.stats?.priceTrend === 'Down' && <TrendingDown className="h-4 w-4 text-emerald-500" />}
                            {(station.stats?.priceTrend === 'Stable' || !station.stats?.priceTrend) && <Minus className="h-4 w-4 text-slate-400" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-600 hidden xl:table-cell">
                        {station.stats?.totalVisits ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-slate-500 text-sm hidden md:table-cell">
                        {station.stats?.lastUpdated ? new Date(station.stats.lastUpdated).toLocaleDateString() : '-'}
                      </TableCell>
                    </>
                  )}
                  
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {/* Bulk Assign button — simple variant, non-verified stations only */}
                      {variant === 'simple' && station.status !== 'verified' && station.status !== 'learnt' && verifiedStations && verifiedStations.length > 0 && stationEntryIds && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 py-0 px-1.5 text-[9px] bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 hover:border-indigo-300 transition-all font-semibold opacity-0 group-hover:opacity-100"
                          title={`Assign ${stationEntryIds.get(station.id)?.length ?? 0} entries to a verified station`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const entryIds = stationEntryIds.get(station.id) || [];
                            if (entryIds.length === 0) return;
                            setBulkAssignTarget({ entryIds, groupName: station.name });
                          }}
                        >
                          <Link className="h-3 w-3 mr-0.5" />
                          Assign
                        </Button>
                      )}
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* --- Pagination Footer --- */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between p-4 bg-slate-50 border-t border-slate-200">
             <div className="flex items-center gap-4">
               <div className="text-xs text-slate-500">
                 Showing <span className="font-medium">{startIndex + 1}</span> to <span className="font-medium">{endIndex}</span> of <span className="font-medium">{totalItems}</span>
               </div>
               <Select 
                 value={itemsPerPage.toString()} 
                 onValueChange={(val) => {
                   setItemsPerPage(parseInt(val));
                   setCurrentPage(1);
                 }}
               >
                 <SelectTrigger className="h-8 w-[70px] text-xs bg-white">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="10">10</SelectItem>
                   <SelectItem value="25">25</SelectItem>
                   <SelectItem value="50">50</SelectItem>
                   <SelectItem value="100">100</SelectItem>
                 </SelectContent>
               </Select>
             </div>

             <div className="flex gap-1">
                <Button 
                   variant="outline" 
                   size="icon" 
                   className="h-8 w-8"
                   disabled={currentPage === 1}
                   onClick={() => setCurrentPage(1)}
                >
                   <ChevronFirst className="h-4 w-4" />
                </Button>
                <Button 
                   variant="outline" 
                   size="icon" 
                   className="h-8 w-8"
                   disabled={currentPage === 1}
                   onClick={() => setCurrentPage(prev => prev - 1)}
                >
                   <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <div className="flex items-center justify-center min-w-[3rem] text-sm font-medium">
                   {currentPage} / {totalPages}
                </div>

                <Button 
                   variant="outline" 
                   size="icon" 
                   className="h-8 w-8"
                   disabled={currentPage === totalPages}
                   onClick={() => setCurrentPage(prev => prev + 1)}
                >
                   <ChevronRight className="h-4 w-4" />
                </Button>
                <Button 
                   variant="outline" 
                   size="icon" 
                   className="h-8 w-8"
                   disabled={currentPage === totalPages}
                   onClick={() => setCurrentPage(totalPages)}
                >
                   <ChevronLast className="h-4 w-4" />
                </Button>
             </div>
          </div>
        )}
      </div>

      {/* Bulk Assign Modal */}
      {bulkAssignTarget && verifiedStations && (
        <BulkAssignModal
          open={!!bulkAssignTarget}
          onClose={() => setBulkAssignTarget(null)}
          entryIds={bulkAssignTarget.entryIds}
          stationGroupName={bulkAssignTarget.groupName}
          verifiedStations={verifiedStations}
          onAssignComplete={() => {
            // Only trigger data refresh — modal handles its own close timing
            onBulkAssignComplete?.();
          }}
        />
      )}
    </div>
  );
}