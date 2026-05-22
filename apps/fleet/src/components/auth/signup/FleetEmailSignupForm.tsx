import React, { useState } from 'react';
import { Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { API_ENDPOINTS } from '../../../services/apiConfig';
import { withProductLineHeaders } from '../../../config/productLine';
import { supabaseAnonFunctionHeaders } from '@roam/api-client';
import { supabase } from '../../../utils/supabase/client';

interface FleetEmailSignupFormProps {
  onBack: () => void;
  onSuccess: () => void;
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireNumber: boolean;
    requireSpecialChar: boolean;
  } | null;
}

export function FleetEmailSignupForm({ onBack, onSuccess, passwordPolicy }: FleetEmailSignupFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!termsAccepted) {
      setError('Please accept the Terms and Privacy Policy.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    const minLen = passwordPolicy?.minLength ?? 6;
    if (password.length < minLen) {
      setError(`Password must be at least ${minLen} characters.`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/signup`, {
        method: 'POST',
        headers: withProductLineHeaders(
          supabaseAnonFunctionHeaders({ 'Content-Type': 'application/json' }),
        ),
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || email.split('@')[0],
          role: 'admin',
          businessType: 'rideshare',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Signup failed');

      if (data.access_token && data.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        onSuccess();
        return;
      }

      setError('Account created. Please sign in.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Full name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900/70 dark:text-white"
          placeholder="Your name"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm dark:border-slate-600 dark:bg-slate-900/70 dark:text-white"
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-10 text-sm dark:border-slate-600 dark:bg-slate-900/70 dark:text-white"
          />
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Confirm password</label>
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900/70 dark:text-white"
        />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} className="mt-1" />
        <span>I accept the Terms and Privacy Policy.</span>
      </label>
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create fleet account'}
      </button>
      <button type="button" className="w-full text-sm text-slate-500" onClick={onBack}>
        Back
      </button>
    </form>
  );
}
