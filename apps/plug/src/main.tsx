import './instrument';
import { createRoot } from 'react-dom/client';
import App from './App';
import { settlePlugAuth } from './authClient';
import './icons.css';
import './index.css';

if (localStorage.getItem('plug-theme') === 'dark') document.documentElement.classList.add('dark');

await settlePlugAuth();
createRoot(document.getElementById('root')!).render(<App />);
