import React, { useState, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  MapPin,
  DollarSign,
  Building2,
  Plus,
  Database,
  ShieldCheck,
  MoreHorizontal,
  Eye,
} from 'lucide-react';
import { TollPlaza } from '../../types/toll';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

// ─── Props ──────────────────────────────────────────────────────────────────
interface TollPlazaListProps {
  plazas: TollPlaza[];
  loading: boolean;
  onSelect: (plaza: TollPlaza) => void;
  onEdit: (plaza: TollPlaza) => void;
  onDelete: (plaza: TollPlaza) => void;
  onRefresh: () => void;
  onAdd?: () => void;
  onPromote?: (plaza: TollPlaza) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
type SortField = 'name' | 'highway' | 'operator' | 'parish' | 'status' | 'transactions' | 'totalSpend';
type SortDir = 'asc' | 'desc';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const statusConfig: Record<string, { label: string; className: string }> = {
  verified: { label: 'Verified', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  unverified: { label: 'Unverified', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  learnt: { label: 'Learnt', className: 'bg-blue-50 text-blue-700 border-blue-200' },
};

function directionIcon(direction: string) {
  switch (direction) {
    case 'Eastbound': return <ArrowRight className="h-3.5 w-3.5 text-slate-500" />;
    case 'Westbound': return <ArrowLeft className="h-3.5 w-3.5 text-slate-500" />;
    case 'Northbound': return <ArrowUp className="h-3.5 w-3.5 text-slate-500" />;
    case 'Southbound': return <ArrowDown className="h-3.5 w-3.5 text-slate-500" />;
    default: return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────
export function TollPlazaList({
  plazas,
  loading,
  onSelect,
  onEdit,
  onDelete,
  onRefresh,
  onAdd,
  onPromote,
}: TollPlazaListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Toggle sort: same field flips direction, new field defaults asc
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Filter
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return plazas;
    const lower = searchTerm.toLowerCase();
    return plazas.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.highway || '').toLowerCase().includes(lower) ||
        (p.parish || '').toLowerCase().includes(lower) ||
        (typeof p.operator === 'string' ? p.operator : '').toLowerCase().includes(lower)
    );
  }, [plazas, searchTerm]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortField) {
        case 'name': return dir * a.name.localeCompare(b.name);
        case 'highway': return dir * (a.highway || '').localeCompare(b.highway || '');
        case 'operator': return dir * String(a.operator || '').localeCompare(String(b.operator || ''));
        case 'parish': return dir * (a.parish || '').localeCompare(b.parish || '');
        case 'status': return dir * a.status.localeCompare(b.status);
        case 'transactions': return dir * ((a.stats?.totalTransactions || 0) - (b.stats?.totalTransactions || 0));
        case 'totalSpend': return dir * ((a.stats?.totalSpend || 0) - (b.stats?.totalSpend || 0));
        default: return 0;
      }
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  // Summary stats
  const totalSpend = plazas.reduce((sum, p) => sum + (p.stats?.totalSpend || 0), 0);
  const verifiedCount = plazas.filter(p => p.status === 'verified').length;
  const unverifiedCount = plazas.filter(p => p.status === 'unverified').length;

  // Sortable header helper
  const SortableHeader = ({ field, label, className: extraClass }: { field: SortField; label: string; className?: string }) => (
    <TableHead
      className={cn('cursor-pointer select-none hover:bg-slate-100 transition-colors', extraClass)}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortField === field ? (
          sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-indigo-500" /> : <ArrowDown className="h-3 w-3 text-indigo-500" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300" />
        )}
      </div>
    </TableHead>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-slate-500 font-medium">Loading toll plazas...</p>
      </div>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (plazas.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
        <Database className="h-12 w-12 text-slate-300 mb-4" />
        <h4 className="text-lg font-semibold text-slate-700 mb-1">No toll plazas yet</h4>
        <p className="text-sm text-slate-500 max-w-md mb-6">
          Add your first toll plaza to start building your toll database. You can enter plazas manually or import them from CSV.
        </p>
        {onAdd && (
          <Button onClick={onAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Toll Plaza
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* ── Header: Stats + Search ───────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Inline Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium text-slate-600">
            <Database className="h-3.5 w-3.5" />
            {plazas.length} Plaza{plazas.length !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-md text-xs font-medium text-emerald-700">
            {verifiedCount} Verified
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-md text-xs font-medium text-amber-700">
            {unverifiedCount} Unverified
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 rounded-md text-xs font-medium text-indigo-700">
            <DollarSign className="h-3.5 w-3.5" />
            {formatCurrency(totalSpend)}
          </div>
        </div>

        {/* Search + Add */}
        <div className="flex items-center gap-3">
          {onAdd && (
            <Button size="sm" className="h-9 gap-1.5" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              Add Plaza
            </Button>
          )}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search plazas..."
              className="pl-9 h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <SortableHeader field="name" label="Name" />
              <SortableHeader field="highway" label="Highway" />
              <TableHead>Direction</TableHead>
              <SortableHeader field="operator" label="Operator" />
              <SortableHeader field="parish" label="Parish" />
              <SortableHeader field="status" label="Status" />
              <SortableHeader field="transactions" label="Transactions" className="text-right" />
              <SortableHeader field="totalSpend" label="Total Spend" className="text-right" />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-slate-500 italic">
                  No plazas match &quot;{searchTerm}&quot;
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((plaza) => {
                const sc = statusConfig[plaza.status] || statusConfig.unverified;
                return (
                  <TableRow
                    key={plaza.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Name */}
                    <TableCell>
                      <button
                        className="text-left font-semibold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer transition-colors"
                        onClick={() => onSelect(plaza)}
                      >
                        {plaza.name}
                      </button>
                      {plaza.address && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{plaza.address}</span>
                        </div>
                      )}
                    </TableCell>

                    {/* Highway */}
                    <TableCell className="text-sm text-slate-700">{plaza.highway || '—'}</TableCell>

                    {/* Direction */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        {directionIcon(plaza.direction)}
                        <span>{plaza.direction}</span>
                      </div>
                    </TableCell>

                    {/* Operator */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[140px]">{plaza.operator || '—'}</span>
                      </div>
                    </TableCell>

                    {/* Parish */}
                    <TableCell className="text-sm text-slate-600">{plaza.parish || '—'}</TableCell>

                    {/* Status */}
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[11px] font-medium', sc.className)}>
                        {sc.label}
                      </Badge>
                    </TableCell>

                    {/* Transactions */}
                    <TableCell className="text-right text-sm font-medium text-slate-700 tabular-nums">
                      {(plaza.stats?.totalTransactions || 0).toLocaleString()}
                    </TableCell>

                    {/* Total Spend */}
                    <TableCell className="text-right text-sm font-medium text-slate-900 tabular-nums">
                      {formatCurrency(plaza.stats?.totalSpend || 0)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); onSelect(plaza); }}
                            className="gap-2 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); onEdit(plaza); }}
                            className="gap-2 cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit Plaza
                          </DropdownMenuItem>
                          {onPromote && plaza.status !== 'verified' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); onPromote(plaza); }}
                                className="gap-2 cursor-pointer text-emerald-600 focus:text-emerald-600"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Promote to Verified
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); onDelete(plaza); }}
                            className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete Plaza
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer count */}
      {searchTerm && sorted.length > 0 && (
        <p className="text-xs text-slate-400 text-right">
          Showing {sorted.length} of {plazas.length} plaza{plazas.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}