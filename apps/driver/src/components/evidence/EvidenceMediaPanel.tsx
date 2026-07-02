import { Camera, Clock, ExternalLink, ImageOff, ShieldAlert } from 'lucide-react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { Button, cn } from '@roam/ui';
import { EvidenceExpiryBadge } from './EvidenceExpiryBadge';
import { resolveEvidenceMediaState } from './evidenceState';
import type { EvidenceLabel, EvidenceMediaState } from './types';

export interface EvidenceMediaPanelProps {
  label?: EvidenceLabel;
  imageUrl?: string | null;
  alt?: string;
  /** Force a state (demo); otherwise derived from props */
  state?: EvidenceMediaState;
  evidenceExpired?: boolean;
  evidenceDeleteAfter?: string | null;
  parentStatus?: string | null;
  className?: string;
  compact?: boolean;
  maxHeightClass?: string;
}

export function EvidenceMediaPanel({
  label = 'Evidence photo',
  imageUrl,
  alt,
  state: stateOverride,
  evidenceExpired,
  evidenceDeleteAfter,
  parentStatus,
  className,
  compact = false,
  maxHeightClass = 'max-h-[280px]',
}: EvidenceMediaPanelProps) {
  const state =
    stateOverride ??
    resolveEvidenceMediaState({
      imageUrl,
      evidenceExpired,
      evidenceDeleteAfter,
      parentStatus,
    });

  const frameClass = cn(
    'relative overflow-hidden rounded-lg border bg-slate-50/50',
    state === 'pending_review' && 'border-2 border-amber-300 bg-amber-50/30',
    state === 'expired' && 'border-dashed border-slate-300 bg-slate-50',
    state === 'expiring_soon' && 'border-orange-200',
    state === 'available' && 'border-slate-200',
    state === 'unavailable' && 'border-dashed border-slate-200',
    className,
  );

  const heightClass = compact ? 'h-24' : cn('min-h-[140px]', maxHeightClass);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <EvidenceExpiryBadge
          state={state}
          deleteAfter={evidenceDeleteAfter}
        />
      </div>

      <div className={cn(frameClass, heightClass)} role="img" aria-label={alt || label}>
        {state === 'available' || state === 'expiring_soon' || state === 'pending_review' ? (
          imageUrl ? (
            <div className="group relative h-full w-full">
              <ImageWithFallback
                src={imageUrl}
                alt={alt || label}
                className={cn(
                  'h-full w-full object-contain bg-black/5',
                  compact ? 'object-cover' : 'object-contain',
                )}
              />
              {!compact && (
                <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/40 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => window.open(imageUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Enlarge
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <EmptyEvidence message="No image URL" />
          )
        ) : null}

        {state === 'expired' && (
          <PlaceholderState
            icon={Clock}
            title="Photo removed"
            description="This evidence was deleted after the 14-day retention period. Extracted data on this record is still available."
          />
        )}

        {state === 'unavailable' && (
          <PlaceholderState
            icon={ImageOff}
            title="No photo submitted"
            description="The driver did not attach a photo for this entry."
          />
        )}
      </div>
    </div>
  );
}

function PlaceholderState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Camera;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center px-4 py-6 text-center">
      <div className="mb-2 rounded-full bg-slate-100 p-3">
        <Icon className="h-6 w-6 text-slate-400" aria-hidden />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-slate-500">{description}</p>
    </div>
  );
}

function EmptyEvidence({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-xs text-slate-400">
      <ShieldAlert className="mr-1.5 h-4 w-4" />
      {message}
    </div>
  );
}
