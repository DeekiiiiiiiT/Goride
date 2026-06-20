import React, { useState } from 'react';
import { supabase, useForgotPassword } from '@roam/auth-client';
import { toast } from 'sonner';
import { 
  Eye, EyeOff, ArrowRight, 
  Utensils, Clock, Star, MapPin, Sparkles
} from 'lucide-react';

interface LoginPageProps {
  onNavigate: (page: string, data?: any) => void;
}

const FEATURES = [
  { icon: Utensils, title: 'Hundreds of Restaurants', description: 'From local favorites to popular chains' },
  { icon: Clock, title: 'Fast Delivery', description: 'Hot meals delivered in 30 minutes or less' },
  { icon: Sparkles, title: 'Exclusive Deals', description: 'Daily discounts and first-order promos' },
  { icon: MapPin, title: 'Live Tracking', description: 'Track your order in real-time' },
];

export default function LoginPage({ onNavigate }: LoginPageProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  } = useForgotPassword(supabase, 'dash', { signInHref: '/' });

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
            data: { name, phone },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success('Account created! Check your email to verify.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success('Welcome back!');
        onNavigate('home');
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col lg:flex-row bg-gray-50">
      {/* Left Panel - Branding & Visual */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 relative overflow-hidden lg:sticky lg:top-[65px] lg:h-[calc(100vh-65px)]">
        {/* Background Blur Orbs */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-yellow-200 rounded-full blur-3xl" />
        </div>

        {/* Floating Food Emojis */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[15%] left-[10%] text-7xl opacity-20 rotate-12">🍕</div>
          <div className="absolute top-[30%] right-[15%] text-6xl opacity-20 -rotate-12">🍔</div>
          <div className="absolute bottom-[25%] left-[20%] text-7xl opacity-20 rotate-6">🌮</div>
          <div className="absolute bottom-[40%] right-[20%] text-6xl opacity-20 -rotate-6">🍜</div>
          <div className="absolute top-[60%] left-[5%] text-5xl opacity-15">🥗</div>
          <div className="absolute top-[10%] right-[35%] text-5xl opacity-15 rotate-12">🍦</div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col px-12 xl:px-16 py-10 xl:py-12 text-white w-full">
          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold">R</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">Roam Dash</h1>
              <p className="text-white/70 text-xs">Food. Delivered.</p>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col justify-center py-8 space-y-8 min-h-0">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full mb-4">
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span className="text-sm font-medium">Hungry? We got you!</span>
              </div>
              <h2 className="text-3xl xl:text-4xl 2xl:text-5xl font-bold leading-tight">
                Delicious food,<br />
                <span className="text-white/95">delivered fast.</span>
              </h2>
              <p className="mt-4 text-base xl:text-lg text-white/80 max-w-md">
                Order from your favorite local restaurants and get it delivered hot to your door.
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-3 max-w-2xl">
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div 
                    key={index}
                    className="bg-white/10 backdrop-blur-sm rounded-xl p-4 hover:bg-white/20 transition-colors border border-white/10"
                  >
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mb-2">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-sm xl:text-base mb-1">{feature.title}</h3>
                    <p className="text-xs xl:text-sm text-white/70 leading-snug">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="flex items-center gap-4 flex-shrink-0 pt-6 border-t border-white/20">
            <div className="flex -space-x-2">
              {['🧑‍🍳', '👨‍🍳', '👩‍🍳'].map((emoji, i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-sm border-2 border-white/30">
                  {emoji}
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star key={i} className="w-4 h-4 fill-yellow-300 text-yellow-300" />
                ))}
              </div>
              <p className="text-xs text-white/80 mt-0.5">Trusted by 50,000+ food lovers in Jamaica</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12">
        <div className="w-full max-w-md py-8">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
              <span className="text-white text-3xl font-bold">R</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Roam Dash</h1>
            <p className="text-gray-500 text-sm">Food. Delivered.</p>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-gray-500 mt-2">
              {isSignUp 
                ? 'Sign up in seconds to start ordering' 
                : 'Sign in to continue your foodie journey'}
            </p>
          </div>

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="876-123-4567"
                    className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
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
                  className="w-full px-4 pr-12 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
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
                    className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
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
                    className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                    onClick={() => setForgotMode(false)}
                  >
                    Back to sign in
                  </button>
                )}
              </div>
            )}

            {notice && (
              <p className="text-sm text-emerald-600 text-center" role="status">{notice}</p>
            )}

            <button
              type="submit"
              disabled={isLoading || forgotLoading}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 group"
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
              className="text-emerald-600 font-semibold hover:text-emerald-700"
            >
              {isSignUp ? 'Sign in' : 'Sign up for free'}
            </button>
          </p>

          {/* Continue as Guest */}
          <button
            onClick={() => onNavigate('home')}
            className="block mx-auto mt-6 text-gray-500 hover:text-gray-700 text-sm font-medium px-4 py-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Continue browsing as guest
          </button>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-8">
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
