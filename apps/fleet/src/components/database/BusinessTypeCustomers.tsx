import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Mail, Calendar, Loader2, Car, Package, Navigation, Truck, Ship } from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { BusinessType } from '../../types/data';
import { BUSINESS_TYPES } from '../../utils/businessTypes';

interface BusinessTypeCustomersProps {
  businessType: BusinessType;
  onNavigate: (page: string, data?: any) => void;
  onBack: () => void;
}

const BUSINESS_TYPE_ICONS: Record<BusinessType, React.ElementType> = {
  rideshare: Car,
  delivery: Package,
  taxi: Navigation,
  trucking: Truck,
  shipping: Ship,
};

interface Customer {
  id: string;
  email: string;
  name: string;
  businessType: BusinessType;
  status: string;
  createdAt: string | null;
  lastSignIn: string | null;
}

export function BusinessTypeCustomers({ businessType, onNavigate, onBack }: BusinessTypeCustomersProps) {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  const { data: allCustomers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['adminCustomers'],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/customers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.customers || [];
    },
    enabled: !!accessToken,
    staleTime: 2 * 60 * 1000,
  });

  const customers = allCustomers.filter(c => c.businessType === businessType);
  const businessTypeInfo = BUSINESS_TYPES.find(bt => bt.key === businessType);
  const Icon = BUSINESS_TYPE_ICONS[businessType];

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 rounded-xl">
            <Icon className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{businessTypeInfo?.label}</h1>
            <p className="text-sm text-slate-500">
              {customers.length} customer{customers.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Customer List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Icon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700">No customers yet</h3>
          <p className="text-sm text-slate-500 mt-1">
            No {businessTypeInfo?.label.toLowerCase()} customers have registered
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {customers.map(customer => (
              <button
                key={customer.id}
                onClick={() => onNavigate(`db-customer-${customer.id}`, { customer })}
                className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors text-left"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-semibold text-sm shrink-0">
                  {(customer.name || customer.email).slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {customer.name || 'Unnamed Customer'}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-sm text-slate-500 truncate">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      {customer.email}
                    </span>
                  </div>
                </div>

                {/* Status & Date */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      customer.status === 'active'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        customer.status === 'active' ? 'bg-green-500' : 'bg-slate-400'
                      }`} />
                      {customer.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    <p className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                      <Calendar className="w-3 h-3" />
                      Last: {formatDate(customer.lastSignIn)}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
