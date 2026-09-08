import React, { useCallback, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Badge } from '../../ui/badge';
import { UnresolvedStopsTab } from './UnresolvedStopsTab';
import { SpatialReviewTab } from './SpatialReviewTab';
import { api } from '../../../services/api';
import { buildUnresolvedStopRows } from './buildUnresolvedStopRows';

export type ResolutionQueueSubTab = 'unresolved-stops' | 'spatial-review' | 'silent-attach';

export interface ResolutionQueueTabProps {
  defaultSubTab?: ResolutionQueueSubTab;
  onPromoted?: () => void;
  onVerifyLocation?: (learntLocation: unknown) => void;
  onResolved?: () => void;
  onCountChange?: (count: number) => void;
  /** Dominion-only: show Silent Station Attach sub-tab. */
  enableSilentAttach?: boolean;
  silentAttachPanel?: React.ReactNode;
}

export function ResolutionQueueTab({
  defaultSubTab = 'unresolved-stops',
  onPromoted,
  onVerifyLocation,
  onResolved,
  onCountChange,
  enableSilentAttach = false,
  silentAttachPanel,
}: ResolutionQueueTabProps) {
  const initialSub =
    defaultSubTab === 'silent-attach' && !enableSilentAttach ? 'unresolved-stops' : defaultSubTab;
  const [subTab, setSubTab] = useState<ResolutionQueueSubTab>(initialSub);
  const [spatialCount, setSpatialCount] = useState(0);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [silentCount, setSilentCount] = useState(0);

  const refreshCounts = useCallback(async () => {
    try {
      const [learnt, evidence, spatial] = await Promise.all([
        api.getLearntLocations(),
        api.getStationGateEvidence({ limit: 5000 }),
        api.getSpatialReviewQueue(),
      ]);
      const unresolved = buildUnresolvedStopRows(
        Array.isArray(learnt) ? learnt : [],
        Array.isArray(evidence) ? evidence : [],
      );
      const spatialN = spatial?.count ?? spatial?.items?.length ?? 0;
      setUnresolvedCount(unresolved.length);
      setSpatialCount(spatialN);
    } catch {
      /* counts are decorative */
    }
  }, []);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    const silentN = enableSilentAttach ? silentCount : 0;
    onCountChange?.(unresolvedCount + spatialCount + silentN);
  }, [unresolvedCount, spatialCount, silentCount, enableSilentAttach, onCountChange]);

  useEffect(() => {
    if (defaultSubTab === 'silent-attach' && !enableSilentAttach) {
      setSubTab('unresolved-stops');
    } else {
      setSubTab(defaultSubTab);
    }
  }, [defaultSubTab, enableSilentAttach]);

  const handlePromoted = () => {
    void refreshCounts();
    onPromoted?.();
  };

  const handleResolved = () => {
    void refreshCounts();
    onResolved?.();
  };

  const handleSilentCount = useCallback((n: number) => {
    setSilentCount(n);
  }, []);

  // Clone panel to inject count + resolved callbacks when it's a valid element.
  const silentPanel =
    enableSilentAttach && silentAttachPanel && React.isValidElement(silentAttachPanel)
      ? React.cloneElement(silentAttachPanel as React.ReactElement<Record<string, unknown>>, {
          embedded: true,
          onCountChange: handleSilentCount,
          onResolved: handleResolved,
        })
      : silentAttachPanel;

  return (
    <Tabs value={subTab} onValueChange={(v) => setSubTab(v as ResolutionQueueSubTab)} className="w-full">
      <div className="border-b border-slate-200 px-4 py-2 bg-white">
        <TabsList className="h-auto min-h-9 bg-slate-100/80 flex-wrap gap-1">
          <TabsTrigger value="unresolved-stops" className="text-xs sm:text-sm gap-1.5">
            Unresolved stops
            {unresolvedCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-indigo-100 text-indigo-800 border-0">
                {unresolvedCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="spatial-review" className="text-xs sm:text-sm gap-1.5">
            Spatial review (GPS)
            {spatialCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-violet-100 text-violet-800 border-0">
                {spatialCount}
              </Badge>
            )}
          </TabsTrigger>
          {enableSilentAttach && (
            <TabsTrigger value="silent-attach" className="text-xs sm:text-sm gap-1.5">
              Silent Attach
              {silentCount > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-fuchsia-100 text-fuchsia-800 border-0">
                  {silentCount}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>
      </div>

      <TabsContent value="unresolved-stops" className="m-0 p-0 border-0">
        <UnresolvedStopsTab onPromoted={handlePromoted} onVerifyLocation={onVerifyLocation} />
      </TabsContent>

      <TabsContent value="spatial-review" className="m-0 p-0 border-0">
        <SpatialReviewTab onResolved={handleResolved} />
      </TabsContent>

      {enableSilentAttach && (
        <TabsContent
          value="silent-attach"
          forceMount
          className={`m-0 p-0 border-0 ${subTab === 'silent-attach' ? '' : 'hidden'}`}
        >
          {silentPanel}
        </TabsContent>
      )}
    </Tabs>
  );
}
