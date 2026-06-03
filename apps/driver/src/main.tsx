import { createRoot } from 'react-dom/client';
import App from './App';
import { initCapacitorNative } from './capacitor-native';
import './index.css';

void initCapacitorNative().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
