import './instrument';
import { createRoot } from 'react-dom/client';
import App from './App';
import { settlePlugAuth } from './authClient';
import './icons.css';
import './index.css';

if (localStorage.getItem('plug-theme') === 'dark') document.documentElement.classList.add('dark');

const PLUG_AUTH_STARTUP_MS = 5000;
await Promise.race([
  settlePlugAuth(),
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, PLUG_AUTH_STARTUP_MS);
  }),
]);

createRoot(document.getElementById('root')!).render(<App />);
