import React, { useCallback, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Badge } from '../../ui/badge';
import { UnresolvedStopsTab } from './UnresolvedStopsTab';
import { SpatialReviewTab } from './SpatialReviewTab';
import { api } from '../../../services/api';
import { buildUnresolvedStopRows } from './buildUnresolvedStopRows';

export type ResolutionQueueSubTab = 'unresolved-stops' | 'spatial-review';

export interface ResolutionQueueTabProps {
  defaultSubTab?: ResolutionQueueSubTab;
  onPromoted?: () => void;
  onVerifyLocation?: (learntLocation: unknown) => void;
  onResolved?: () => void;
  onCountChange?: (count: number) => void;
}

export function ResolutionQueueTab({
  defaultSubTab = 'unresolved-stops',
  onPromoted,
  onVerifyLocation,
  onResolved,
  onCountChange,
}: ResolutionQueueTabProps) {
  const [subTab, setSubTab] = useState<ResolutionQueueSubTab>(defaultSubTab);
  const [spatialCount, setSpatialCount] = useState(0);
  const [unresolvedCount, setUnresolvedCount] = useState(0);

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
      onCountChange?.(unresolved.length + spatialN);
    } catch {
      /* counts are decorative */
    }
  }, [onCountChange]);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    setSubTab(defaultSubTab);
  }, [defaultSubTab]);

  const handlePromoted = () => {
    void refreshCounts();
    onPromoted?.();
  };

  const handleResolved = () => {
    void refreshCounts();
    onResolved?.();
  };

  return (
    <Tabs value={subTab} onValueChange={(v) => setSubTab(v as ResolutionQueueSubTab)} className="w-full">
      <div className="border-b border-slate-200 px-4 py-2 bg-white">
        <TabsList className="h-9 bg-slate-100/80">
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
        </TabsList>
      </div>

      <TabsContent value="unresolved-stops" className="m-0 p-0 border-0">
        <UnresolvedStopsTab onPromoted={handlePromoted} onVerifyLocation={onVerifyLocation} />
      </TabsContent>

      <TabsContent value="spatial-review" className="m-0 p-0 border-0">
        <SpatialReviewTab onResolved={handleResolved} />
      </TabsContent>
    </Tabs>
  );
}
