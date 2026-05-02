import { Sparkles, BrainCircuit, Map as MapIcon, Database, Car } from 'lucide-react';
import type { Provider } from './hooks';

export const PROVIDER_META: Record<Provider, { label: string; color: string; icon: typeof Sparkles; description: string }> = {
  openai:      { label: 'OpenAI',       color: 'text-emerald-400', icon: Sparkles,     description: 'GPT-4o vision + chat for OCR, document parsing, toll parsing.' },
  gemini:      { label: 'Google AI',    color: 'text-sky-400',     icon: BrainCircuit, description: 'Gemini text/vision + Imagen for vehicle image generation.' },
  google_maps: { label: 'Google Maps',  color: 'text-amber-400',   icon: MapIcon,      description: 'Maps JS, Geocoding, Static Maps, Places.' },
  supabase:    { label: 'Supabase',     color: 'text-teal-400',    icon: Database,     description: 'Storage, Edge Functions, service-role operations.' },
  uber:        { label: 'Uber',         color: 'text-slate-300',   icon: Car,          description: 'OAuth integration for driver/trip imports.' },
};

export const PROVIDER_ORDER: Provider[] = ['openai', 'gemini', 'google_maps', 'supabase', 'uber'];

export function fmtUSD(n: number | undefined): string {
  const v = typeof n === 'number' ? n : 0;
  if (v === 0) return '$0.00';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

export function fmtNum(n: number | undefined): string {
  const v = typeof n === 'number' ? n : 0;
  return v.toLocaleString();
}

export function fmtDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
