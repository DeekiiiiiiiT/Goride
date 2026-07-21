/**
 * Focused presentation helpers for Approvals / Detail / Vendors subviews only.
 * Hub-wide UI states live in HubStates; money formatting lives in ../money.
 */
import {
  Car,
  FileCheck2,
  Landmark,
  Lock,
  MonitorSmartphone,
  Package,
  Receipt,
  Shield,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ExpenseDocument } from '../../../types/expenseHub';

/** Relative age for queue rows ("2h ago", "3d ago"). */
export function timeAgo(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Insurance: Shield,
  Security: Lock,
  Lease: Landmark,
  Maintenance: Wrench,
  Software: MonitorSmartphone,
  Permits: FileCheck2,
  Equipment: Package,
  Parking: Car,
  Other: Receipt,
};

export function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] || Receipt;
}

export type DocUrgency = { level: 'overdue' | 'aging'; label: string } | null;

/** Urgency derived from real fields only: past-due bills and stale submissions. */
export function docUrgency(
  doc: Pick<ExpenseDocument, 'dueDate' | 'submittedAt' | 'createdAt'>,
  todayYmd = new Date().toISOString().slice(0, 10),
): DocUrgency {
  if (doc.dueDate && doc.dueDate < todayYmd) return { level: 'overdue', label: 'Overdue' };
  const since = doc.submittedAt || doc.createdAt;
  if (since) {
    const days = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000);
    if (days >= 3) return { level: 'aging', label: `Waiting ${days}d` };
  }
  return null;
}

export function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(url);
}

/** Short human reference from the real document id. */
export function shortRef(id: string): string {
  return `EXP-${id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}`;
}

/** "3 vehicles" / "Business-level" for allocation summaries. */
export function allocationLabel(allocations: ExpenseDocument['allocations']): string {
  if (!allocations.length) return 'Business-level';
  return `${allocations.length} vehicle${allocations.length === 1 ? '' : 's'}`;
}
