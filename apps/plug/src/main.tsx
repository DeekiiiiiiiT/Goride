import './instrument';
import { createRoot } from 'react-dom/client';
import App from './App';
import './icons.css';
import './index.css';

if (localStorage.getItem('plug-theme') === 'dark') document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(<App />);
