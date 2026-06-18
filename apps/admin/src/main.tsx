import { createRoot } from 'react-dom/client';
import App from './App';
import { initPortalTheme } from './hooks/usePortalTheme';
import './index.css';

initPortalTheme();

createRoot(document.getElementById('root')!).render(<App />);
