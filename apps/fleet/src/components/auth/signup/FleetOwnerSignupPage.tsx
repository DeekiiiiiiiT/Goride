import React, { useEffect, useState } from 'react';
import { Car, Mail, ArrowLeft } from 'lucide-react';
import { FleetGoogleSignupButton } from './FleetGoogleSignupButton';
import { FleetEmailSignupForm } from './FleetEmailSignupForm';
import { FleetPhoneAuthWizard } from './FleetPhoneAuthWizard';
import { API_ENDPOINTS } from '../../../services/apiConfig';
import { withProductLineHeaders } from '../../../config/productLine';
import { supabaseAnonFunctionHeaders } from '@roam/api-client';

type SubView = 'main' | 'email' | 'phone';

export function FleetOwnerSignupPage({ fromRoamdriver }: { fromRoamdriver?: boolean }) {
  const [subView, setSubView] = useState<SubView>('main');
  const [error, setError] = useState<string | null>(null);
  const [passwordPolicy, setPasswordPolicy] = useState<{
    minLength: number;
    requireUppercase: boolean;
    requireNumber: boolean;
    requireSpecialChar: boolean;
  } | null>(null);

  useEffect(() => {
    fetch(`${API_ENDPOINTS.admin}/platform-status`, {
      headers: withProductLineHeaders(supabaseAnonFunctionHeaders()),
    })
      .then(res => res.json())
      .then(data => {
        if (data.passwordPolicy) setPasswordPolicy(data.passwordPolicy);
      })
      .catch(() => {});
  }, []);

  const goLogin = () => {
    window.history.replaceState({}, '', '/');
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-900">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={goLogin}
            className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Sign in instead
          </button>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-600">
              <Car className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Create your fleet</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {fromRoamdriver
                ? 'Set up Roam Fleet to manage drivers. Same account works on Roam Driver.'
                : 'Rideshare fleet management on Roam Fleet — sign up in minutes.'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </div>
            )}

            {subView === 'email' && (
              <FleetEmailSignupForm
                passwordPolicy={passwordPolicy}
                onBack={() => {
                  setSubView('main');
                  setError(null);
                }}
                onSuccess={() => {
                  window.history.replaceState({}, '', '/');
                  window.location.reload();
                }}
              />
            )}

            {subView === 'phone' && (
              <FleetPhoneAuthWizard
                onVerified={() => {
                  window.history.replaceState({}, '', '/signup?complete=1');
                  window.location.reload();
                }}
                onCancel={() => {
                  setSubView('main');
                  setError(null);
                }}
              />
            )}

            {subView === 'main' && (
              <div className="space-y-4">
                <FleetGoogleSignupButton onError={msg => setError(msg || null)} />
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSubView('email');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100"
                >
                  <Mail className="h-4 w-4 text-indigo-600" />
                  Continue with email
                </button>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-200 dark:border-slate-600" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase text-slate-400">
                    <span className="bg-white px-2 dark:bg-slate-800">or phone</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSubView('phone');
                  }}
                  className="flex w-full items-center justify-center rounded-lg border border-slate-300 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100"
                >
                  Continue with phone
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
