import { Moon, Sun } from 'lucide-react';
import { usePortalTheme } from '../../hooks/usePortalTheme';
import { api } from '../../services/api';

export function ThemeToggle() {
  const { isDark, setDarkMode } = usePortalTheme();

  const handleToggle = () => {
    const next = !isDark;
    setDarkMode(next);
    void api.getPreferences()
      .catch(() => ({}))
      .then((prefs) => api.savePreferences({ ...(prefs || {}), darkMode: next }))
      .catch(() => {
        // Preference is still stored locally via applyPortalTheme
      });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg transition-colors"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
    </button>
  );
}
