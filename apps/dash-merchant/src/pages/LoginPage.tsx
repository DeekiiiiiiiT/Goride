import React, { useState } from 'react';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { 
  Eye, EyeOff, Mail, Lock, ArrowRight, Store, TrendingUp, 
  Clock, CreditCard, ChefHat, Smartphone, CheckCircle2
} from 'lucide-react';

interface LoginPageProps {
  onSuccess: () => void;
}

const FEATURES = [
  { icon: Store, title: 'Easy Menu Management', description: 'Update your menu in real-time with photos and modifiers' },
  { icon: Smartphone, title: 'Real-time Orders', description: 'Get instant notifications when orders come in' },
  { icon: TrendingUp, title: 'Analytics Dashboard', description: 'Track sales, popular items, and growth metrics' },
  { icon: CreditCard, title: 'Multiple Payments', description: 'Accept cash, cards, and digital payments' },
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
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
    <div className="min-h-screen flex">
      {/* Left Panel - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white rounded-full blur-3xl opacity-20" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold">R</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Roam Dash</h1>
              <p className="text-white/70 text-sm">Partner Portal</p>
            </div>
          </div>

          {/* Main Content */}
          <div className="space-y-8">
            <div>
              <h2 className="text-4xl xl:text-5xl font-bold leading-tight">
                Grow your restaurant<br />
                <span className="text-white/90">with Roam Dash</span>
              </h2>
              <p className="mt-4 text-lg text-white/80 max-w-md">
                Join hundreds of restaurants reaching more customers and increasing revenue with our delivery platform.
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-4">
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div 
                    key={index}
                    className="bg-white/10 backdrop-blur-sm rounded-xl p-4 hover:bg-white/20 transition-colors"
                  >
                    <Icon className="w-8 h-8 mb-3" />
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-sm text-white/70">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-12">
            {STATS.map((stat, index) => (
              <div key={index}>
                <p className="text-3xl xl:text-4xl font-bold">{stat.value}</p>
                <p className="text-white/70 text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute bottom-0 right-0 w-64 h-64 opacity-20">
          <ChefHat className="w-full h-full" />
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-gray-50">
        <div className="w-full max-w-md">
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
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@restaurant.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-12 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  required
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

            {!isSignUp && (
              <div className="flex justify-end">
                <button type="button" className="text-sm text-amber-600 hover:text-amber-700 font-medium">
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 group"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Please wait...
                </>
              ) : (
                <>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
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
            <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <p className="font-medium text-amber-800 mb-3">Why partner with us?</p>
              <ul className="space-y-2">
                {[
                  'No monthly fees - only pay per order',
                  'Keep 85% of every order',
                  'Free marketing & promotions',
                  '24/7 customer support'
                ].map((benefit, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-amber-700">
                    <CheckCircle2 className="w-4 h-4 text-amber-500" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
