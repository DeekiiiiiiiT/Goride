// Stitch: dominion-redesign/dfbd91b2308242d0bbbd33b83de0389e
import { useEffect, useState } from 'react';
import { JamaicaSectionShell } from '../JamaicaSectionShell';
import { AreaInspector } from './AreaInspector';
import { fetchArea, type AreaDetail } from './jamaicaMapApi';
import { MapCanvas } from './MapCanvas';
import { RecentChanges } from './RecentChanges';
import './jamaicaMap.css';

function readArea(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('area');
}

function writeArea(pcode: string | null) {
  const url = new URL(window.location.href);
  if (pcode) url.searchParams.set('area', pcode);
  else url.searchParams.delete('area');
  window.history.replaceState({ page: 'world-jamaica' }, '', `${url.pathname}?${url.searchParams.toString()}`);
}

export function JamaicaMapPage({
  accessToken,
  canWrite,
  onNavigate,
}: {
  accessToken: string;
  canWrite: boolean;
  onNavigate: (pageId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(readArea);
  const [area, setArea] = useState<AreaDetail | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) {
      setArea(null);
      return;
    }
    let cancelled = false;
    void fetchArea(accessToken, selected)
      .then((body) => {
        if (!cancelled) setArea(body);
      })
      .catch(() => {
        if (!cancelled) setArea(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, selected]);

  function choose(pcode: string | null) {
    setSelected(pcode);
    writeArea(pcode);
  }

  const parent = area?.place.parent_pcode ?? null;

  return (
    <JamaicaSectionShell page="world-jamaica" accessToken={accessToken} onNavigate={onNavigate}>
      {(summary) => (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto lg:h-[680px]">
            <MapCanvas
              token={accessToken}
              selected={selected}
              selectedName={area?.place.name ?? null}
              parentPcode={parent}
              hoverPcode={hover}
              onSelect={(pcode) => choose(pcode)}
            />
            <AreaInspector
              summary={summary}
              area={area}
              loading={!summary}
              canWrite={canWrite}
              onSelect={choose}
              onHover={setHover}
              onNavigate={onNavigate}
            />
          </div>
          <RecentChanges rows={summary?.recent ?? []} />
        </>
      )}
    </JamaicaSectionShell>
  );
}
