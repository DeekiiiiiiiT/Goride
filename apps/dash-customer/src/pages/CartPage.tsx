import React, { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { API_ENDPOINTS } from '@roam/api-client';
import { 
  ArrowLeft, Minus, Plus, Trash2, CreditCard, Banknote, 
  DollarSign, ShoppingBag, MapPin, MessageSquare, Tag, X, Check, ChevronDown
} from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { toast } from 'sonner';

type PaymentMethod = 'cash' | 'wipay' | 'paypal';

interface SavedAddress {
  id: string;
  label: string;
  address: string;
}

interface PromoCode {
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrder: number;
}

const PROMO_CODES: Record<string, PromoCode> = {
  'WELCOME10': { code: 'WELCOME10', type: 'percentage', value: 10, minOrder: 500 },
  'FIRST50': { code: 'FIRST50', type: 'fixed', value: 50, minOrder: 300 },
  'FREEDEL': { code: 'FREEDEL', type: 'fixed', value: 200, minOrder: 1000 },
};

const SAVED_ADDRESSES_KEY = 'roam-dash-addresses';

interface CartPageProps {
  onNavigate: (page: string, data?: any) => void;
  session: Session | null;
}

export default function CartPage({ onNavigate, session }: CartPageProps) {
  const { items, merchantName, merchantId, updateQuantity, removeItem, clearCart, subtotal } = useCart();
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [tip, setTip] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [saveCurrentAddress, setSaveCurrentAddress] = useState(false);
  const [addressLabel, setAddressLabel] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(SAVED_ADDRESSES_KEY);
    if (saved) {
      try {
        setSavedAddresses(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved addresses', e);
      }
    }
  }, []);

  const saveAddress = () => {
    if (!deliveryAddress.trim() || !addressLabel.trim()) return;
    
    const newAddress: SavedAddress = {
      id: Date.now().toString(),
      label: addressLabel,
      address: deliveryAddress,
    };
    
    const updated = [...savedAddresses, newAddress];
    setSavedAddresses(updated);
    localStorage.setItem(SAVED_ADDRESSES_KEY, JSON.stringify(updated));
    setSaveCurrentAddress(false);
    setAddressLabel('');
    toast.success('Address saved');
  };

  const removeAddress = (id: string) => {
    const updated = savedAddresses.filter(a => a.id !== id);
    setSavedAddresses(updated);
    localStorage.setItem(SAVED_ADDRESSES_KEY, JSON.stringify(updated));
  };

  const selectAddress = (address: SavedAddress) => {
    setDeliveryAddress(address.address);
    setShowAddressDropdown(false);
  };

  const applyPromoCode = () => {
    const code = promoCode.toUpperCase().trim();
    const promo = PROMO_CODES[code];
    
    if (!promo) {
      toast.error('Invalid promo code');
      return;
    }
    
    if (subtotal < promo.minOrder) {
      toast.error(`Minimum order of $${promo.minOrder} required`);
      return;
    }
    
    setAppliedPromo(promo);
    toast.success(`Promo code applied: ${code}`);
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
    setPromoCode('');
  };

  const calculateDiscount = () => {
    if (!appliedPromo) return 0;
    if (appliedPromo.type === 'percentage') {
      return subtotal * (appliedPromo.value / 100);
    }
    return appliedPromo.value;
  };

  const deliveryFee = 200;
  const discount = calculateDiscount();
  const discountedSubtotal = subtotal - discount;
  const platformFee = discountedSubtotal * 0.05;
  const tax = discountedSubtotal * 0.165;
  const total = discountedSubtotal + deliveryFee + platformFee + tax + tip;

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
          merchantId: merchantId,
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
          <ShoppingBag className="w-12 h-12 text-gray-400" />
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
          <div key={item.id} className="p-4">
            <div className="flex gap-4">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900">{item.name}</h3>
                {item.options && item.options.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {item.options.map((opt, idx) => (
                      <p key={idx} className="text-xs text-gray-500">
                        {opt.name}: {opt.selections.map(s => s.name).join(', ')}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-emerald-600 font-medium mt-1">${item.price.toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="p-1.5 rounded-full hover:bg-gray-100 border border-gray-200"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center font-medium">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="p-1.5 rounded-full hover:bg-gray-100 border border-gray-200"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-1.5 ml-2 rounded-full hover:bg-red-50 text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-gray-400" />
          Delivery Details
        </h2>
        
        {savedAddresses.length > 0 && (
          <div className="mb-3">
            <button
              onClick={() => setShowAddressDropdown(!showAddressDropdown)}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg flex items-center justify-between hover:bg-gray-50"
            >
              <span className="text-gray-600">Select saved address</span>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showAddressDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showAddressDropdown && (
              <div className="mt-1 border border-gray-200 rounded-lg divide-y bg-white shadow-lg">
                {savedAddresses.map(addr => (
                  <div
                    key={addr.id}
                    className="flex items-center justify-between p-3 hover:bg-gray-50"
                  >
                    <button
                      onClick={() => selectAddress(addr)}
                      className="flex-1 text-left"
                    >
                      <p className="font-medium text-gray-900">{addr.label}</p>
                      <p className="text-sm text-gray-500 truncate">{addr.address}</p>
                    </button>
                    <button
                      onClick={() => removeAddress(addr.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        <input
          type="text"
          placeholder="Enter your delivery address"
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
        />
        
        {deliveryAddress && !savedAddresses.find(a => a.address === deliveryAddress) && (
          <div className="mb-3">
            {!saveCurrentAddress ? (
              <button
                onClick={() => setSaveCurrentAddress(true)}
                className="text-sm text-emerald-600 hover:text-emerald-700"
              >
                + Save this address
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Label (e.g., Home, Work)"
                  value={addressLabel}
                  onChange={(e) => setAddressLabel(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={saveAddress}
                  disabled={!addressLabel.trim()}
                  className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setSaveCurrentAddress(false);
                    setAddressLabel('');
                  }}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
        
        <div className="relative">
          <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <textarea
            placeholder="Delivery instructions (e.g., gate code, landmarks)"
            value={deliveryInstructions}
            onChange={(e) => setDeliveryInstructions(e.target.value)}
            rows={2}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Tag className="w-5 h-5 text-gray-400" />
          Promo Code
        </h2>
        {appliedPromo ? (
          <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div>
              <p className="font-medium text-emerald-700">{appliedPromo.code}</p>
              <p className="text-sm text-emerald-600">
                {appliedPromo.type === 'percentage' 
                  ? `${appliedPromo.value}% off` 
                  : `$${appliedPromo.value} off`}
              </p>
            </div>
            <button
              onClick={removePromoCode}
              className="p-2 text-emerald-600 hover:text-emerald-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter promo code"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={applyPromoCode}
              disabled={!promoCode.trim()}
              className="px-4 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">Try: WELCOME10, FIRST50, FREEDEL</p>
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold text-gray-900 mb-4">Add a Tip for Your Driver</h2>
        <div className="grid grid-cols-4 gap-2">
          {[0, 50, 100, 200].map(amount => (
            <button
              key={amount}
              onClick={() => setTip(amount)}
              className={`py-3 rounded-lg text-sm font-medium transition-colors ${
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
            className={`w-full p-4 rounded-lg border-2 flex items-center gap-4 transition-all ${
              paymentMethod === 'cash'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              paymentMethod === 'cash' ? 'bg-emerald-500' : 'bg-gray-100'
            }`}>
              <Banknote className={`w-5 h-5 ${paymentMethod === 'cash' ? 'text-white' : 'text-green-600'}`} />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-900">Cash on Delivery</p>
              <p className="text-sm text-gray-500">Pay when your order arrives</p>
            </div>
          </button>
          <button
            onClick={() => setPaymentMethod('wipay')}
            className={`w-full p-4 rounded-lg border-2 flex items-center gap-4 transition-all ${
              paymentMethod === 'wipay'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              paymentMethod === 'wipay' ? 'bg-emerald-500' : 'bg-gray-100'
            }`}>
              <CreditCard className={`w-5 h-5 ${paymentMethod === 'wipay' ? 'text-white' : 'text-blue-600'}`} />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-900">Card (WiPay)</p>
              <p className="text-sm text-gray-500">Visa, Mastercard accepted</p>
            </div>
          </button>
          <button
            onClick={() => setPaymentMethod('paypal')}
            className={`w-full p-4 rounded-lg border-2 flex items-center gap-4 transition-all ${
              paymentMethod === 'paypal'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              paymentMethod === 'paypal' ? 'bg-emerald-500' : 'bg-gray-100'
            }`}>
              <DollarSign className={`w-5 h-5 ${paymentMethod === 'paypal' ? 'text-white' : 'text-blue-800'}`} />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-900">PayPal</p>
              <p className="text-sm text-gray-500">Pay with PayPal account</p>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
            <span className="font-medium">${subtotal.toFixed(2)}</span>
          </div>
          {appliedPromo && discount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount ({appliedPromo.code})</span>
              <span className="font-medium">-${discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Delivery fee</span>
            <span className="font-medium">${deliveryFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Platform fee</span>
            <span className="font-medium">${platformFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tax (16.5% GCT)</span>
            <span className="font-medium">${tax.toFixed(2)}</span>
          </div>
          {tip > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Driver tip</span>
              <span className="font-medium">${tip.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between pt-3 border-t text-lg font-bold">
            <span>Total</span>
            <span className="text-emerald-600">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handlePlaceOrder}
        disabled={isPlacingOrder || !deliveryAddress.trim()}
        className="w-full mt-6 py-4 bg-emerald-500 text-white rounded-xl font-semibold text-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isPlacingOrder ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <ShoppingBag className="w-5 h-5" />
            Place Order • ${total.toFixed(2)}
          </>
        )}
      </button>

      <p className="text-center text-sm text-gray-500 mt-4">
        {paymentMethod === 'cash' && 'You will pay cash when your order arrives'}
        {paymentMethod === 'wipay' && 'You will be redirected to WiPay to complete payment'}
        {paymentMethod === 'paypal' && 'You will be redirected to PayPal to complete payment'}
      </p>
    </div>
  );
}
