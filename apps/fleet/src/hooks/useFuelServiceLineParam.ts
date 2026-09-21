import { useCallback, useEffect, useMemo, useState } from 'react';
import { useServiceLineScope } from '../contexts/ServiceLineScopeContext';
import { useFeatureFlags } from '../components/auth/FeatureFlagContext';
import type { FuelLineTab } from '../utils/fuelServiceLineFilter';
import { isFuelServiceLineTabsEnabled } from '../utils/fuelServiceLineTabsFlag';

function readLineFromUrl(showTabs: boolean): FuelLineTab {
  try {
    const raw = new URLSearchParams(window.location.search).get('line');
    if (raw === 'delivery') return 'delivery';
    if (raw === 'rideshare') return 'rideshare';
    if (raw === 'all') return 'all';
    if (raw === 'unattributed') return 'all'; // chip handles unattributed; tab stays all
  } catch {
    /* ignore */
  }
  return showTabs ? 'all' : 'all';
}

function writeLineToUrl(line: FuelLineTab) {
  try {
    const url = new URL(window.location.href);
    if (line === 'all') url.searchParams.delete('line');
    else url.searchParams.set('line', line);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}

/**
 * Fuel page lens: ?line=all|rideshare|delivery.
 * Tabs when org has both rideshare + rush_delivery AND kill switch is on (S8).
 */
export function useFuelServiceLineParam() {
  const { rideshareVisible, rushVisible } = useServiceLineScope();
  const { enabledModules } = useFeatureFlags();
  const tabsFlagOn = isFuelServiceLineTabsEnabled(enabledModules);
  const showTabs = rideshareVisible && rushVisible && tabsFlagOn;

  const [line, setLineState] = useState<FuelLineTab>(() => readLineFromUrl(showTabs));

  useEffect(() => {
    if (!showTabs) {
      if (line !== 'all') setLineState('all');
      return;
    }
    const fromUrl = readLineFromUrl(true);
    if (fromUrl !== line) setLineState(fromUrl);
    // Sync URL when landing without param
    if (!new URLSearchParams(window.location.search).has('line') && line === 'all') {
      /* keep clean URL for all */
    }
  }, [showTabs]); // eslint-disable-line react-hooks/exhaustive-deps -- URL is source of truth on capability change

  const setLine = useCallback(
    (next: FuelLineTab) => {
      if (!showTabs && next !== 'all') return;
      setLineState(next);
      writeLineToUrl(next);
    },
    [showTabs],
  );

  return useMemo(
    () => ({
      line: showTabs ? line : ('all' as FuelLineTab),
      setLine,
      showTabs,
    }),
    [line, setLine, showTabs],
  );
}
