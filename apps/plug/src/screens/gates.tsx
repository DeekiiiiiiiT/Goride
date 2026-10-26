import { useEffect, useState, type ReactNode } from 'react';
import { plugSend, publicGet } from '../api';
import { catalogVariant } from '../shell/facts';
import { EmptyGarageScreen } from './generated/EmptyGarageScreen';
import { EmptyInboxScreen } from './generated/EmptyInboxScreen';
import { ExploreLoadingScreen } from './generated/ExploreLoadingScreen';
import { FirstSaveScreen } from './generated/FirstSaveScreen';
import { HomeExploreScreen } from './generated/HomeExploreScreen';
import { MyVehiclesScreen } from './generated/MyVehiclesScreen';
import { NotificationsScreen } from './generated/NotificationsScreen';
import { PartsCategoriesScreen } from './generated/PartsCategoriesScreen';
import { OfflineChipScreen } from './generated/OfflineChipScreen';
import { PartsComingSoonScreen } from './generated/PartsComingSoonScreen';
import { SavedScreen } from './generated/SavedScreen';

export function ExploreGate() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [mode, setMode] = useState<'loading' | 'empty' | 'ready'>('loading');
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    void publicGet<{ stations: unknown[] }>('/stations')
      .then(() => setMode('ready'))
      .catch(() => setMode('ready'));
  }, []);
  if (offline) return <OfflineChipScreen />;
  if (mode === 'loading') return <ExploreLoadingScreen />;
  return <HomeExploreScreen />;
}

export function GarageGate() {
  const [mode, setMode] = useState<'loading' | 'empty' | 'ready'>('loading');
  useEffect(() => {
    void plugSend<{ vehicles: unknown[] }>('/garage', 'GET')
      .then((body) => setMode(body.vehicles?.length ? 'ready' : 'empty'))
      .catch(() => setMode('empty'));
  }, []);
  if (mode === 'loading') return <ExploreLoadingScreen />;
  if (mode === 'empty') return <EmptyGarageScreen />;
  return <MyVehiclesScreen />;
}

export function InboxGate() {
  const [mode, setMode] = useState<'loading' | 'empty' | 'ready'>('loading');
  useEffect(() => {
    void plugSend<{ notifications: unknown[] }>('/notifications', 'GET')
      .then((body) => setMode(body.notifications?.length ? 'ready' : 'empty'))
      .catch(() => setMode('empty'));
  }, []);
  if (mode === 'loading') return <ExploreLoadingScreen />;
  if (mode === 'empty') return <EmptyInboxScreen />;
  return <NotificationsScreen />;
}

export function SavedGate() {
  const first = sessionStorage.getItem('plug-first-fill') === '1';
  return first ? <FirstSaveScreen /> : <SavedScreen />;
}

export function PartsGate() {
  const [soon, setSoon] = useState<boolean | null>(null);
  useEffect(() => {
    const variant = catalogVariant();
    if (!variant) {
      setSoon(true);
      return;
    }
    void publicGet<{ comingSoon?: boolean; parts?: unknown[] }>(`/parts?variant=${encodeURIComponent(variant)}`)
      .then((body) => setSoon(Boolean(body.comingSoon) || (body.parts || []).length === 0))
      .catch(() => setSoon(true));
  }, []);
  if (soon == null) return <ExploreLoadingScreen />;
  if (soon) return <PartsComingSoonScreen />;
  return <PartsCategoriesScreen />;
}

export function GateFrame({ children }: { children: ReactNode }) {
  return children;
}
