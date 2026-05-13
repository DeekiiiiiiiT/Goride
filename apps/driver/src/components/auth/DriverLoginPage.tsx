import React, { useState } from 'react';
import { Car, Loader2, AlertCircle, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { ThemeToggleButton } from '../layout/ThemeToggleButton';

export function DriverLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: 'driver',
            },
          },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="flex justify-end px-4 pt-4">
        <ThemeToggleButton />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-12 -mt-8">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4 shadow-lg shadow-emerald-500/25">
              <Car className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Roam Driver</h1>
            <p className="text-slate-600 dark:text-slate-300 text-sm mt-2 font-medium">
              {mode === 'login' ? 'Sign in to your account' : 'Create your driver account'}
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl p-6 shadow-xl dark:bg-slate-800/60 dark:border-slate-700/60">
            {error && (
              <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2.5 text-sm font-medium dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-200">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="driver@email.com"
                    required
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 text-sm font-medium dark:bg-slate-900/70 dark:border-slate-600 dark:text-white dark:placeholder-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 text-sm font-medium dark:bg-slate-900/70 dark:border-slate-600 dark:text-white dark:placeholder-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-600/20"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                  </>
                ) : (
                  mode === 'login' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-200 text-center dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login');
                  setError(null);
                }}
                className="text-slate-700 hover:text-emerald-700 text-sm font-semibold transition-colors dark:text-slate-300 dark:hover:text-emerald-400"
              >
                {mode === 'login'
                  ? "Don't have an account? Sign up"
                  : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>

          <p className="text-center text-slate-600 dark:text-slate-400 text-xs mt-6 font-medium leading-relaxed">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
