// Stitch: dominion-redesign/dfbd91b2308242d0bbbd33b83de0389e
import { ImportsPage } from './imports/ImportsPage';
import { JamaicaMapPage } from './jamaica-map/JamaicaMapPage';
import { LevelBrowserPage } from './levels/LevelBrowserPage';
import { PinsPage } from './pins/PinsPage';

export function WorldMapsPage({
  page,
  accessToken,
  canWrite,
  onNavigate,
}: {
  page: string;
  accessToken: string;
  canWrite: boolean;
  onNavigate: (pageId: string) => void;
}) {
  if (page === 'world-parishes' || page === 'world-towns' || page === 'world-communities') {
    return <LevelBrowserPage page={page} accessToken={accessToken} canWrite={canWrite} onNavigate={onNavigate} />;
  }
  if (page === 'world-places') {
    return <PinsPage accessToken={accessToken} canWrite={canWrite} onNavigate={onNavigate} />;
  }
  if (page === 'world-imports' || page === 'world-quality') {
    return <ImportsPage page={page} accessToken={accessToken} canWrite={canWrite} onNavigate={onNavigate} />;
  }
  return <JamaicaMapPage accessToken={accessToken} canWrite={canWrite} onNavigate={onNavigate} />;
}
