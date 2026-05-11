import React, { useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { API_ENDPOINTS } from '@roam/api-client';
import { ArrowLeft, Minus, Plus, Trash2, CreditCard, Banknote, DollarSign } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { toast } from 'sonner';

type PaymentMethod = 'cash' | 'wipay' | 'paypal';

interface CartPageProps {
  onNavigate: (page: string, data?: any) => void;
  session: Session | null;
}

export default function CartPage({ onNavigate, session }: CartPageProps) {
  const { items, merchantName, updateQuantity, removeItem, clearCart, subtotal } = useCart();
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [tip, setTip] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  const deliveryFee = 200;
  const platformFee = subtotal * 0.05;
  const tax = subtotal * 0.165;
  const total = subtotal + deliveryFee + platformFee + tax + tip;

  const handlePlaceOrder = async () => {
    if (!session) {
      toast.error('Please sign in to place an order');
      onNavigate('login');
      return;
    }

    if (!deliveryAddress.trim()) {
      toast.error('Please enter a delivery address');
      return;
    }

    if (items.length === 0) {
      toast.error('Your cart is empty');
      return;
    }

    setIsPlacingOrder(true);

    try {
      const res = await fetch(`${API_ENDPOINTS.delivery}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          merchantId: items[0].merchantId,
          items: items.map(item => ({
            item_id: item.itemId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            options: item.options,
          })),
          deliveryAddress,
          deliveryInstructions,
          deliveryFee,
          tip,
          paymentMethod,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to place order');
      }

      const { order } = await res.json();

      if (paymentMethod === 'wipay' || paymentMethod === 'paypal') {
        const paymentRes = await fetch(`${API_ENDPOINTS.payments}/intents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            provider: paymentMethod,
          }),
        });

        if (!paymentRes.ok) {
          throw new Error('Failed to create payment');
        }

        const { clientSecret } = await paymentRes.json();
        
        clearCart();
        window.location.href = clientSecret;
        return;
      }

      clearCart();
      toast.success('Order placed successfully!');
      onNavigate('tracking', { orderId: order.id });
    } catch (error: any) {
      toast.error(error.message || 'Failed to place order');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Your cart is empty</h2>
        <p className="text-gray-500 mb-6">Add some delicious items to get started</p>
        <button
          onClick={() => onNavigate('home')}
          className="px-6 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600"
        >
          Browse restaurants
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={() => onNavigate('home')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back</span>
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Your Cart</h1>
      <p className="text-gray-500 mb-6">From {merchantName}</p>

      <div className="bg-white rounded-xl shadow-sm divide-y">
        {items.map(item => (
          <div key={item.itemId} className="p-4 flex gap-4">
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-16 h-16 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">{item.name}</h3>
              <p className="text-emerald-600 font-medium">${item.price.toFixed(2)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQuantity(item.itemId, item.quantity - 1)}
                className="p-1 rounded-full hover:bg-gray-100"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-medium">{item.quantity}</span>
              <button
                onClick={() => updateQuantity(item.itemId, item.quantity + 1)}
                className="p-1 rounded-full hover:bg-gray-100"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => removeItem(item.itemId)}
                className="p-1 ml-2 rounded-full hover:bg-red-50 text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold text-gray-900 mb-4">Delivery Details</h2>
        <input
          type="text"
          placeholder="Delivery address"
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
        />
        <textarea
          placeholder="Delivery instructions (optional)"
          value={deliveryInstructions}
          onChange={(e) => setDeliveryInstructions(e.target.value)}
          rows={2}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold text-gray-900 mb-4">Add a Tip</h2>
        <div className="flex gap-2">
          {[0, 50, 100, 200].map(amount => (
            <button
              key={amount}
              onClick={() => setTip(amount)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tip === amount
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {amount === 0 ? 'No tip' : `$${amount}`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold text-gray-900 mb-4">Payment Method</h2>
        <div className="space-y-2">
          <button
            onClick={() => setPaymentMethod('cash')}
            className={`w-full p-4 rounded-lg border-2 flex items-center gap-3 transition-colors ${
              paymentMethod === 'cash'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Banknote className="w-6 h-6 text-green-600" />
            <div className="text-left">
              <p className="font-medium text-gray-900">Cash on Delivery</p>
              <p className="text-sm text-gray-500">Pay when your order arrives</p>
            </div>
          </button>
          <button
            onClick={() => setPaymentMethod('wipay')}
            className={`w-full p-4 rounded-lg border-2 flex items-center gap-3 transition-colors ${
              paymentMethod === 'wipay'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <CreditCard className="w-6 h-6 text-blue-600" />
            <div className="text-left">
              <p className="font-medium text-gray-900">Card (WiPay)</p>
              <p className="text-sm text-gray-500">Visa, Mastercard accepted</p>
            </div>
          </button>
          <button
            onClick={() => setPaymentMethod('paypal')}
            className={`w-full p-4 rounded-lg border-2 flex items-center gap-3 transition-colors ${
              paymentMethod === 'paypal'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <DollarSign className="w-6 h-6 text-blue-800" />
            <div className="text-left">
              <p className="font-medium text-gray-900">PayPal</p>
              <p className="text-sm text-gray-500">Pay with PayPal account</p>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Delivery fee</span>
            <span>${deliveryFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Platform fee</span>
            <span>${platformFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tax (16.5% GCT)</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          {tip > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Tip</span>
              <span>${tip.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t text-lg font-semibold">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handlePlaceOrder}
        disabled={isPlacingOrder}
        className="w-full mt-6 py-4 bg-emerald-500 text-white rounded-xl font-semibold text-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPlacingOrder ? 'Placing order...' : `Place Order - $${total.toFixed(2)}`}
      </button>

      <p className="text-center text-sm text-gray-500 mt-4">
        {paymentMethod === 'cash' && 'Payment: Cash on Delivery'}
        {paymentMethod === 'wipay' && 'Payment: You will be redirected to WiPay'}
        {paymentMethod === 'paypal' && 'Payment: You will be redirected to PayPal'}
      </p>
    </div>
  );
}
