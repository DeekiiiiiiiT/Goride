import { Database, HardDrive, RefreshCw, Timer } from 'lucide-react';
import type { EvidenceStorageSummary } from '@roam/types/evidence';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { cn } from '../ui/utils';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Unknown';
  const diffMs = Date.now() - then;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface StorageHealthPanelProps {
  summary?: EvidenceStorageSummary | null;
  loading?: boolean;
  className?: string;
}

const MOCK_SUMMARY: EvidenceStorageSummary = {
  activeCount: 42,
  scheduledCount: 18,
  deletedCount: 156,
  pendingHoldCount: 7,
  totalBytes: 48_500_000,
  expiringWithin7Days: 12,
  lastCleanupAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  lastCleanupPurged: 23,
};

export function StorageHealthPanel({
  summary,
  loading = false,
  className,
}: StorageHealthPanelProps) {
  const data = summary ?? MOCK_SUMMARY;

  return (
    <Card className={cn('border-slate-200 shadow-sm', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-indigo-100 p-2">
            <HardDrive className="h-5 w-5 text-indigo-700" />
          </div>
          <div>
            <CardTitle className="text-base">Ephemeral evidence storage</CardTitle>
            <CardDescription className="text-xs">
              Scan photos auto-delete 14 days after approval
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading storage summary…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Active files" value={String(data.activeCount)} icon={Database} />
              <StatTile label="Scheduled purge" value={String(data.scheduledCount)} icon={Timer} />
              <StatTile
                label="Ephemeral size"
                value={formatBytes(data.totalBytes)}
                icon={HardDrive}
              />
              <StatTile
                label="Expiring ≤7d"
                value={String(data.expiringWithin7Days)}
                icon={Timer}
                highlight={data.expiringWithin7Days > 0}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
              Last cleanup: {formatRelativeTime(data.lastCleanupAt)}
              {data.lastCleanupPurged > 0 && (
                <span className="text-slate-500">· {data.lastCleanupPurged} files removed</span>
              )}
              <span className="text-slate-400">· Pending hold: {data.pendingHoldCount}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: typeof Database;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-100 bg-white p-3',
        highlight && 'border-orange-200 bg-orange-50/50',
      )}
    >
      <Icon className="mb-1 h-4 w-4 text-slate-400" />
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
