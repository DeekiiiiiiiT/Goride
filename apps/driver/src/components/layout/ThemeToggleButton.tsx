import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-amber-200 dark:hover:bg-slate-700 transition-colors"
    >
      {isDark ? <Sun className="w-5 h-5" strokeWidth={2} /> : <Moon className="w-5 h-5" strokeWidth={2} />}
    </button>
  );
}
