import { createRoot } from 'react-dom/client';
import App from './App';
import { initCapacitorNative } from './capacitor-native';
import { setDispatchAuthClient } from '@roam/hauler-dispatch';
import { supabase } from './utils/supabase/client';
import './index.css';

setDispatchAuthClient(supabase);

void initCapacitorNative().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
