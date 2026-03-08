import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  ChevronDown, ChevronUp, Trash2, Download, Upload,
  HardDrive, RotateCcw, Clock, AlertCircle, CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { AuditEntry, getAuditLog, clearAuditLog, AuditOperation, AuditStatus } from '../../services/audit-log';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function opIcon(op: AuditOperation) {
  switch (op) {
    case 'export': return <Download className="h-3.5 w-3.5 text-emerald-500" />;
    case 'import': return <Upload className="h-3.5 w-3.5 text-blue-500" />;
    case 'backup': return <HardDrive className="h-3.5 w-3.5 text-indigo-500" />;
    case 'restore': return <RotateCcw className="h-3.5 w-3.5 text-orange-500" />;
  }
}

function statusBadge(status: AuditStatus) {
  switch (status) {
    case 'success': return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">OK</Badge>;
    case 'partial': return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">Partial</Badge>;
    case 'failed': return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">Failed</Badge>;
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-JM', { day: 'numeric', month: 'short' });
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

interface Props {
  refreshKey?: number; // bump this to re-read the log
}

export function ImportExportHistory({ refreshKey }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const entries = useMemo(() => getAuditLog(), [refreshKey, isExpanded]);
  const visible = showAll ? entries : entries.slice(0, 10);

  if (entries.length === 0 && !isExpanded) return null; // Don't show if empty and collapsed

  return (
    <Card className="border-slate-200">
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            Activity Log
            {entries.length > 0 && (
              <span className="text-xs text-slate-400 font-normal">({entries.length})</span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {isExpanded && entries.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-slate-400 hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Clear all activity log entries?')) {
                    clearAuditLog();
                    setIsExpanded(false);
                  }
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
            {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0">
          {entries.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No operations recorded yet.</p>
          ) : (
            <div className="space-y-0">
              {visible.map(entry => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
              {entries.length > 10 && !showAll && (
                <button
                  className="text-xs text-indigo-500 hover:text-indigo-700 py-2 w-full text-center"
                  onClick={() => setShowAll(true)}
                >
                  Show all {entries.length} entries
                </button>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Audit Row
// ═══════════════════════════════════════════════════════════════════════════

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div
        className="flex items-center gap-2 py-2 px-1 cursor-pointer hover:bg-slate-50 rounded text-xs"
        onClick={() => entry.errors?.length ? setExpanded(!expanded) : null}
      >
        {opIcon(entry.operation)}
        <span className="font-medium text-slate-700 capitalize">{entry.operation}</span>
        <span className="text-slate-500 truncate flex-1">{entry.category}</span>
        <span className="text-slate-400 tabular-nums">{entry.recordCount.toLocaleString()}</span>
        {entry.format && (
          <span className="text-slate-300 uppercase text-[10px]">{entry.format}</span>
        )}
        {statusBadge(entry.status)}
        <span className="text-slate-400 text-[10px] w-14 text-right shrink-0">{formatRelative(entry.timestamp)}</span>
        {entry.errors && entry.errors.length > 0 && (
          <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
        )}
      </div>
      {expanded && entry.errors && entry.errors.length > 0 && (
        <div className="px-6 pb-2 space-y-0.5">
          {entry.errors.slice(0, 5).map((err, i) => (
            <p key={i} className="text-[10px] text-red-500 truncate">{err}</p>
          ))}
          {entry.errors.length > 5 && (
            <p className="text-[10px] text-red-400">...and {entry.errors.length - 5} more</p>
          )}
        </div>
      )}
    </div>
  );
}
