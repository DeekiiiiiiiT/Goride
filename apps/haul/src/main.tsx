import { createRoot } from 'react-dom/client';
import App from './App';
import { setDispatchAuthClient } from '@roam/hauler-dispatch';
import { supabase } from './utils/supabase/client';
import './index.css';

setDispatchAuthClient(supabase);

createRoot(document.getElementById('root')!).render(<App />);
