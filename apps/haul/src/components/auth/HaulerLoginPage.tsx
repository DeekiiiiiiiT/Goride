import React, { useState } from 'react';

import { ArrowRight, Eye, EyeOff, Loader2, User } from 'lucide-react';

import { supabase } from '../../utils/supabase/client';

import { HaulAuthAtmosphere } from './HaulAuthAtmosphere';

import { HaulerSignupWizard } from './HaulerSignupWizard';

import { haulAuthOrRow, haulErrorBox, haulFieldLabel, haulPrimaryBtn } from './haulAuthUi';
import { HaulerGoogleSignupButton } from './HaulerEmailSignupForm';



type AuthView = 'login' | 'signup';



type HaulerLoginPageProps = {

  initialView?: AuthView;

};



export function HaulerLoginPage({ initialView = 'login' }: HaulerLoginPageProps) {

  const [view, setView] = useState<AuthView>(initialView);

  const [identifier, setIdentifier] = useState('');

  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);



  if (view === 'signup') {

    return <HaulerSignupWizard onLogin={() => setView('login')} />;

  }



  const handleLogin = async (e: React.FormEvent) => {

    e.preventDefault();

    setLoading(true);

    setError(null);

    try {

      const trimmed = identifier.trim();

      if (!trimmed.includes('@')) {

        setError('Sign in with your email address, or create an account with your phone number.');

        return;

      }

      const { error: signErr } = await supabase.auth.signInWithPassword({

        email: trimmed,

        password,

      });

      if (signErr) throw signErr;

    } catch (err) {

      setError(err instanceof Error ? err.message : 'Sign in failed');

    } finally {

      setLoading(false);

    }

  };



  return (

    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#0b1326] p-4 text-[#dae2fd] antialiased md:p-12">

      <div className="pointer-events-none absolute inset-0 opacity-20">

        <div className="absolute top-[-20%] left-[-10%] h-[60vw] w-[60vw] rounded-full bg-[#f59e0b] blur-[120px]" />

        <div className="absolute right-[-10%] bottom-[-20%] h-[50vw] w-[50vw] rounded-full bg-[#2d3449] blur-[100px]" />

      </div>



      <div className="relative z-10 w-full max-w-md">

        <div className="mb-8 text-center">

          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg border border-[#534434] bg-[#171f33]">

            <span

              className="material-symbols-outlined text-3xl text-[#ffc174]"

              style={{ fontVariationSettings: "'FILL' 1" }}

            >

              local_shipping

            </span>

          </div>

          <h1 className="mb-2 text-[28px] leading-9 font-bold md:text-[32px]">Welcome back</h1>

          <p className="text-base text-[#d8c3ad]">Sign in to your hauler account</p>

        </div>



        <div className="rounded-xl border border-[#534434] bg-[#171f33] p-6 shadow-lg backdrop-blur-md md:p-8">

          {error ? <div className={`${haulErrorBox} mb-6`}>{error}</div> : null}

          <div className="mb-6 flex flex-col gap-4">
            <HaulerGoogleSignupButton variant="login" onError={(msg) => setError(msg || null)} />
            <div className={haulAuthOrRow}>
              <div className="h-px flex-1 bg-[#534434]" />
              <span className="text-sm font-medium tracking-widest text-[#d8c3ad] uppercase">or</span>
              <div className="h-px flex-1 bg-[#534434]" />
            </div>
          </div>

          <form className="space-y-6" onSubmit={(e) => void handleLogin(e)}>

            <div>

              <label className={`${haulFieldLabel} mb-1 block`} htmlFor="identifier">

                Email or Phone

              </label>

              <div className="relative">

                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">

                  <User className="h-5 w-5 text-[#d8c3ad]" />

                </div>

                <input

                  id="identifier"

                  type="text"

                  required

                  className="block h-11 w-full rounded-lg border border-[#31394d] bg-[#0b1326] pr-4 pl-11 text-base text-[#dae2fd] placeholder:text-[#d8c3ad]/50 focus:border-[#ffc174] focus:ring-2 focus:ring-[#ffc174] focus:outline-none"

                  placeholder="Enter your email or phone"

                  value={identifier}

                  onChange={(e) => setIdentifier(e.target.value)}

                  autoComplete="username"

                />

              </div>

            </div>



            <div>

              <div className="mb-1 flex items-center justify-between">

                <label className={haulFieldLabel} htmlFor="password">

                  Password

                </label>

                <button

                  type="button"

                  className="text-sm text-[#ffc174] transition-colors hover:text-[#ffddb8]"

                  onClick={() => setError('Password reset is coming soon.')}

                >

                  Forgot password?

                </button>

              </div>

              <div className="relative">

                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">

                  <span className="material-symbols-outlined text-xl text-[#d8c3ad]">lock</span>

                </div>

                <input

                  id="password"

                  type={showPassword ? 'text' : 'password'}

                  required

                  className="block h-11 w-full rounded-lg border border-[#31394d] bg-[#0b1326] pr-12 pl-11 text-base text-[#dae2fd] placeholder:text-[#d8c3ad]/50 focus:border-[#ffc174] focus:ring-2 focus:ring-[#ffc174] focus:outline-none"

                  placeholder="••••••••"

                  value={password}

                  onChange={(e) => setPassword(e.target.value)}

                  autoComplete="current-password"

                />

                <button

                  type="button"

                  onClick={() => setShowPassword(!showPassword)}

                  className="absolute top-0 right-0 flex h-11 w-11 items-center justify-center text-[#d8c3ad] hover:text-[#dae2fd]"

                  aria-label={showPassword ? 'Hide password' : 'Show password'}

                >

                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}

                </button>

              </div>

            </div>



            <button type="submit" disabled={loading} className={`${haulPrimaryBtn} bg-[#ffc174] text-[#472a00] hover:bg-[#ffb95f]`}>

              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}

              Sign In

              <ArrowRight className="h-5 w-5" />

            </button>

          </form>

        </div>



        <div className="mt-6 text-center">

          <p className="text-base text-[#d8c3ad]">

            Don&apos;t have an account?{' '}

            <button

              type="button"

              onClick={() => {

                setError(null);

                setView('signup');

              }}

              className="border-b border-transparent pb-0.5 font-medium text-[#ffc174] transition-colors hover:border-[#ffb95f] hover:text-[#ffddb8]"

            >

              Sign up

            </button>

          </p>

        </div>

      </div>

    </div>

  );

}


