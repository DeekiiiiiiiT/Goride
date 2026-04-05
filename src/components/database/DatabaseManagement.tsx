import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Car, Package, Navigation, Truck, Ship, ChevronRight, Settings2, Users, Loader2 } from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { BusinessType } from '../../types/data';
import { BUSINESS_TYPES } from '../../utils/businessTypes';

interface DatabaseManagementProps {
  onNavigate: (page: string, data?: any) => void;
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
}

export function DatabaseManagement({ onNavigate }: DatabaseManagementProps) {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
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

  const customersByType = BUSINESS_TYPES.map(bt => ({
    ...bt,
    customers: customers.filter(c => c.businessType === bt.key),
    activeCount: customers.filter(c => c.businessType === bt.key && c.status === 'active').length,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Database Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Select a business type to view customer ledgers
          </p>
        </div>
        <button
          onClick={() => onNavigate('db-settings')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          Ledger Settings
        </button>
      </div>

      {/* Business Type Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customersByType.map(bt => {
            const Icon = BUSINESS_TYPE_ICONS[bt.key];
            const hasCustomers = bt.customers.length > 0;
            
            return (
              <button
                key={bt.key}
                onClick={() => hasCustomers && onNavigate(`db-biz-${bt.key}`)}
                disabled={!hasCustomers}
                className={`
                  relative p-6 bg-white rounded-xl border text-left transition-all
                  ${hasCustomers
                    ? 'border-slate-200 hover:border-amber-300 hover:shadow-md cursor-pointer'
                    : 'border-slate-100 opacity-60 cursor-not-allowed'
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-xl ${hasCustomers ? 'bg-amber-50' : 'bg-slate-100'}`}>
                    <Icon className={`w-6 h-6 ${hasCustomers ? 'text-amber-600' : 'text-slate-400'}`} />
                  </div>
                  {hasCustomers && (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                </div>

                <h3 className="text-lg font-semibold text-slate-900 mt-4">{bt.label}</h3>
                <p className="text-sm text-slate-500 mt-1">{bt.description}</p>

                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-slate-700">{bt.customers.length}</span>
                    <span className="text-slate-500">customers</span>
                  </div>
                  {bt.activeCount > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-slate-500">{bt.activeCount} active</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Summary Stats */}
      {!isLoading && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-bold text-slate-900">{customers.length}</p>
                <p className="text-sm text-slate-500">Total Customers</p>
              </div>
              <div className="w-px h-10 bg-slate-200" />
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {customers.filter(c => c.status === 'active').length}
                </p>
                <p className="text-sm text-slate-500">Active</p>
              </div>
              <div className="w-px h-10 bg-slate-200" />
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {customersByType.filter(bt => bt.customers.length > 0).length}
                </p>
                <p className="text-sm text-slate-500">Business Types</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
