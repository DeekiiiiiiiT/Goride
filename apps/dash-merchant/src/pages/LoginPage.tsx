import React, { useState } from 'react';
import { supabase, useForgotPassword } from '@roam/auth-client';
import { toast } from 'sonner';
import { 
  Eye, EyeOff, ArrowRight, Store, TrendingUp, 
  CreditCard, ChefHat, Smartphone, CheckCircle2
} from 'lucide-react';

interface LoginPageProps {
  onSuccess: () => void;
}

const FEATURES = [
  { icon: Store, title: 'Easy Menu Management', description: 'Update your menu in real-time' },
  { icon: Smartphone, title: 'Real-time Orders', description: 'Get instant order notifications' },
  { icon: TrendingUp, title: 'Analytics Dashboard', description: 'Track sales and growth metrics' },
  { icon: CreditCard, title: 'Multiple Payments', description: 'Cash, cards, and digital payments' },
];

const STATS = [
  { value: '500+', label: 'Partner Restaurants' },
  { value: '50K+', label: 'Orders Delivered' },
  { value: '4.8', label: 'Average Rating' },
];

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  } = useForgotPassword(supabase, 'partner', { signInHref: '/' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotMode) {
      setNotice(null);
      const err = await sendResetEmail(email);
      if (err) toast.error(err);
      return;
    }
    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success('Account created! Check your email to verify.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Welcome back!');
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-50">
      {/* Left Panel - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 relative">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute top-10 left-10 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col px-12 xl:px-16 py-10 xl:py-12 text-white w-full min-h-screen">
          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold">R</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">Roam Dash</h1>
              <p className="text-white/70 text-xs">Partner Portal</p>
            </div>
          </div>

          {/* Main Content - takes available space and centers */}
          <div className="flex-1 flex flex-col justify-center py-8 space-y-8 min-h-0">
            <div>
              <h2 className="text-3xl xl:text-4xl 2xl:text-5xl font-bold leading-tight">
                Grow your restaurant<br />
                <span className="text-white/90">with Roam Dash</span>
              </h2>
              <p className="mt-4 text-base xl:text-lg text-white/80 max-w-md">
                Join hundreds of restaurants reaching more customers and increasing revenue with our delivery platform.
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-3 max-w-2xl">
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div 
                    key={index}
                    className="bg-white/10 backdrop-blur-sm rounded-xl p-4 hover:bg-white/20 transition-colors"
                  >
                    <Icon className="w-7 h-7 mb-2" />
                    <h3 className="font-semibold text-sm xl:text-base mb-1">{feature.title}</h3>
                    <p className="text-xs xl:text-sm text-white/70 leading-snug">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats - always at bottom */}
          <div className="flex gap-8 xl:gap-12 flex-shrink-0 pt-6 border-t border-white/20">
            {STATS.map((stat, index) => (
              <div key={index}>
                <p className="text-2xl xl:text-3xl font-bold">{stat.value}</p>
                <p className="text-white/70 text-xs xl:text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md py-8">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
              <span className="text-white text-3xl font-bold">R</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Roam Dash Partner</h1>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-gray-500 mt-2">
              {isSignUp 
                ? 'Start receiving orders in minutes' 
                : 'Sign in to manage your restaurant'}
            </p>
          </div>

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@restaurant.com"
                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                required
              />
            </div>

            {!forgotMode && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 pr-12 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  required={!forgotMode}
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            )}

            {!isSignUp && (
              <div className="flex justify-end">
                {!forgotMode ? (
                  <button
                    type="button"
                    className="text-sm text-amber-600 hover:text-amber-700 font-medium"
                    onClick={() => {
                      setForgotMode(true);
                      setNotice(null);
                    }}
                  >
                    Forgot password?
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-sm text-amber-600 hover:text-amber-700 font-medium"
                    onClick={() => setForgotMode(false)}
                  >
                    Back to sign in
                  </button>
                )}
              </div>
            )}

            {notice && (
              <p className="text-sm text-amber-700 text-center" role="status">{notice}</p>
            )}

            <button
              type="submit"
              disabled={isLoading || forgotLoading}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 group"
            >
              {isLoading || forgotLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Please wait...
                </>
              ) : (
                <>
                  {isSignUp ? 'Create Account' : forgotMode ? 'Send reset email' : 'Sign In'}
                  {!forgotMode && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-gray-50 text-gray-500">or</span>
            </div>
          </div>

          {/* Toggle Sign In / Sign Up */}
          <p className="text-center text-gray-600">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-amber-600 font-semibold hover:text-amber-700"
            >
              {isSignUp ? 'Sign in' : 'Sign up for free'}
            </button>
          </p>

          {/* Benefits for Sign Up */}
          {isSignUp && (
            <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <p className="font-medium text-amber-800 mb-3">Why partner with us?</p>
              <ul className="space-y-2">
                {[
                  'No monthly fees - only pay per order',
                  'Keep 85% of every order',
                  'Free marketing & promotions',
                  '24/7 customer support'
                ].map((benefit, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-amber-700">
                    <CheckCircle2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-6">
            By continuing, you agree to our{' '}
            <a href="#" className="text-gray-600 hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-gray-600 hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}
