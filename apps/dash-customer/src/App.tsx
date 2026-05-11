import React, { useState, useEffect } from 'react';
import { supabase } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import HomePage from './pages/HomePage';
import RestaurantPage from './pages/RestaurantPage';
import CartPage from './pages/CartPage';
import OrdersPage from './pages/OrdersPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import LoginPage from './pages/LoginPage';
import PaymentCallbackPage from './pages/PaymentCallbackPage';
import { CartProvider } from './hooks/useCart';

type Page = 'home' | 'restaurant' | 'cart' | 'orders' | 'tracking' | 'login' | 'payment-callback-wipay' | 'payment-callback-paypal';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [pageData, setPageData] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/payment/callback/wipay')) {
      setCurrentPage('payment-callback-wipay');
    } else if (path.includes('/payment/callback/paypal')) {
      setCurrentPage('payment-callback-paypal');
    }
  }, []);

  const navigate = (page: Page, data?: any) => {
    setCurrentPage(page);
    setPageData(data);
    window.scrollTo(0, 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500" />
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={navigate} />;
      case 'restaurant':
        return <RestaurantPage merchantId={pageData?.merchantId} onNavigate={navigate} />;
      case 'cart':
        return <CartPage onNavigate={navigate} session={session} />;
      case 'orders':
        if (!session) return <LoginPage onNavigate={navigate} />;
        return <OrdersPage onNavigate={navigate} />;
      case 'tracking':
        return <OrderTrackingPage orderId={pageData?.orderId} onNavigate={navigate} />;
      case 'login':
        return <LoginPage onNavigate={navigate} />;
      case 'payment-callback-wipay':
        return <PaymentCallbackPage onNavigate={navigate} session={session} provider="wipay" />;
      case 'payment-callback-paypal':
        return <PaymentCallbackPage onNavigate={navigate} session={session} provider="paypal" />;
      default:
        return <HomePage onNavigate={navigate} />;
    }
  };

  return (
    <CartProvider>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => navigate('home')}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">R</span>
              </div>
              <span className="text-xl font-bold text-gray-900">Roam Dash</span>
            </button>
            <nav className="flex items-center gap-4">
              <button
                onClick={() => navigate('cart')}
                className="p-2 hover:bg-gray-100 rounded-full relative"
              >
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </button>
              {session ? (
                <button
                  onClick={() => navigate('orders')}
                  className="text-sm font-medium text-gray-700 hover:text-emerald-600"
                >
                  My Orders
                </button>
              ) : (
                <button
                  onClick={() => navigate('login')}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600"
                >
                  Sign In
                </button>
              )}
            </nav>
          </div>
        </header>
        <main>
          {renderPage()}
        </main>
      </div>
    </CartProvider>
  );
}
