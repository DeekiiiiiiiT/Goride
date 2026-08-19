import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ISSUE_TYPES } from '@/lib/accountSubContent';
import { submitCustomerOrderIssue, uploadCustomerIssuePhoto } from '@/lib/customerApi';
import { assertCustomerAvatarFile, CUSTOMER_AVATAR_ACCEPT } from '@/lib/profileAvatar';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  orderId?: string;
  issueType?: string;
  returnTo?: string;
};

type ApiOrder = {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  merchant: { name: string; logo_url?: string } | null;
};

function orderDetailLine(order: ApiOrder): string {
  const when = new Date(order.created_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${when} • ${order.order_number}`;
}

export default function ReportIssuePage({
  onNavigate,
  orderId,
  issueType: initialIssueType,
  returnTo = 'help',
}: Props) {
  const [selectedOrder, setSelectedOrder] = useState(orderId ?? '');
  const [issueType, setIssueType] = useState(
    ISSUE_TYPES.some((type) => type.id === initialIssueType) ? initialIssueType! : 'other',
  );
  const [details, setDetails] = useState('');
  const [photoPath, setPhotoPath] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(`${API_ENDPOINTS.delivery}/customer/orders`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json() as Promise<{ orders: ApiOrder[] }>;
    },
    retry: false,
  });

  const orders = useMemo(
    () => (data?.orders ?? []).filter(o => o.status !== 'cancelled').slice(0, 20),
    [data],
  );

  useEffect(() => {
    if (selectedOrder) return;
    if (orderId && orders.some(o => o.id === orderId)) {
      setSelectedOrder(orderId);
      return;
    }
    if (orders[0]) setSelectedOrder(orders[0].id);
  }, [orderId, orders, selectedOrder]);

  const goBack = () => {
    if (returnTo === 'order-details' || returnTo === 'tracking') {
      onNavigate(returnTo, { orderId: selectedOrder || orderId });
      return;
    }
    onNavigate(returnTo);
  };

  const handleSubmit = async () => {
    if (!selectedOrder) {
      toast.error('Select an order');
      return;
    }
    if (details.trim().length < 8) {
      toast.error('Please describe what happened');
      return;
    }
    setSubmitting(true);
    try {
      await submitCustomerOrderIssue({
        orderId: selectedOrder,
        issueType,
        notes: details.trim(),
        photoPath: photoPath || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhotoPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      assertCustomerAvatarFile(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not attach photo');
      return;
    }
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadCustomerIssuePhoto(file);
      setPhotoPath(uploaded.path);
      setPhotoPreview(uploaded.signedUrl);
      toast.success('Photo attached');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not attach photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-background">
        <MaterialIcon name="check_circle" className="text-primary text-[64px] mb-4" filled />
        <h2 className="text-headline-md font-semibold mb-2">Report submitted</h2>
        <p className="text-body-md text-on-surface-variant text-center mb-6">
          We saved this against your order. Support will follow up.
        </p>
        <button
          type="button"
          onClick={goBack}
          className="text-primary font-semibold"
        >
          Back to {returnTo === 'help' || !returnTo ? 'Help' : 'order'}
        </button>
      </div>
    );
  }

  return (
    <div className="text-on-surface antialiased bg-background pb-[100px] min-h-dvh">
      <header className="bg-surface w-full top-0 sticky shadow-sm z-40 safe-t">
        <div className="flex items-center px-4 py-2 w-full max-w-[600px] mx-auto min-h-16">
          <button type="button" onClick={goBack} aria-label="Go back" className="w-10 h-10 flex items-center justify-center rounded-full">
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-sm font-semibold text-primary">Report an Issue</h1>
        </div>
      </header>

      <main className="max-w-[600px] mx-auto px-4 py-6 w-full flex flex-col gap-6">
        <div>
          <h2 className="text-headline-lg-mobile font-bold mb-1">What went wrong?</h2>
          <p className="text-body-md text-on-surface-variant">
            Select your recent order and tell us what happened so we can make it right.
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-label-md font-semibold uppercase tracking-wider">Select Order</h3>
          {isLoading ? (
            <p className="text-body-sm text-on-surface-variant">Loading your orders…</p>
          ) : orders.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">
              No recent orders to report on.
            </p>
          ) : (
            orders.map(order => {
              const selected = selectedOrder === order.id;
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedOrder(order.id)}
                  className={`bg-surface-container-lowest rounded-xl p-4 flex items-center gap-4 text-left transition-colors ${
                    selected
                      ? 'border border-outline-variant shadow-[0px_4px_20px_rgba(0,0,0,0.04)]'
                      : 'border border-transparent opacity-70 hover:bg-surface-container-low'
                  }`}
                >
                  <div className={`${selected ? 'w-16 h-16' : 'w-12 h-12'} rounded-lg bg-surface-container-high overflow-hidden shrink-0`}>
                    {order.merchant?.logo_url ? (
                      <img src={order.merchant.logo_url} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`${selected ? 'text-headline-sm font-semibold' : 'text-body-lg'} line-clamp-1`}>
                      {order.merchant?.name ?? 'Restaurant'}
                    </h4>
                    <p className="text-body-sm text-on-surface-variant">{orderDetailLine(order)}</p>
                  </div>
                  {selected ? (
                    <MaterialIcon name="check_circle" className="text-primary" filled />
                  ) : (
                    <MaterialIcon name="chevron_right" className="text-outline" />
                  )}
                </button>
              );
            })
          )}
        </section>

        <div className="h-px w-full bg-outline-variant opacity-30" />

        <section className="flex flex-col gap-4">
          <h3 className="text-label-md font-semibold uppercase tracking-wider">Type of Issue</h3>
          <div className="grid grid-cols-2 gap-2">
            {ISSUE_TYPES.map(type => (
              <button
                key={type.id}
                type="button"
                onClick={() => setIssueType(type.id)}
                className={`h-full bg-surface-container-lowest border rounded-lg p-4 flex flex-col gap-2 text-left transition-all ${
                  issueType === type.id
                    ? 'border-2 border-primary shadow-[0px_4px_20px_rgba(0,0,0,0.04)]'
                    : 'border-outline-variant hover:bg-surface-container-low'
                }`}
              >
                <MaterialIcon name={type.icon} className={issueType === type.id ? 'text-primary' : 'text-on-surface-variant'} />
                <span className="text-body-md font-medium">{type.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-label-md font-semibold uppercase tracking-wider">Details</h3>
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="Describe issue (e.g., The festival was missing from the bag...)"
            className="w-full bg-[#F3F4F6] border-none rounded-lg p-4 text-body-md focus:bg-surface-container-lowest focus:border-2 focus:border-primary transition-all resize-none min-h-[120px] placeholder:text-outline"
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-label-md font-semibold uppercase tracking-wider">Photo (optional)</h3>
          <input
            ref={fileRef}
            type="file"
            accept={CUSTOMER_AVATAR_ACCEPT}
            className="hidden"
            onChange={(e) => void handlePhotoPick(e)}
          />
          {photoPreview ? (
            <div className="relative w-full max-w-[220px]">
              <img src={photoPreview} alt="Attached evidence" className="w-full h-36 object-cover rounded-lg" />
              <button
                type="button"
                onClick={() => {
                  setPhotoPath('');
                  setPhotoPreview('');
                }}
                className="absolute top-2 right-2 bg-surface rounded-full p-1 shadow"
                aria-label="Remove photo"
              >
                <MaterialIcon name="close" className="text-sm" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={uploadingPhoto}
              onClick={() => fileRef.current?.click()}
              className="w-full border border-dashed border-outline-variant rounded-lg py-6 text-body-md text-on-surface-variant flex flex-col items-center gap-2 disabled:opacity-50"
            >
              <MaterialIcon name="add_a_photo" className="text-primary" />
              {uploadingPhoto ? 'Uploading…' : 'Add a photo'}
            </button>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <button
            type="button"
            disabled={submitting || uploadingPhoto || orders.length === 0}
            onClick={() => void handleSubmit()}
            className="w-full bg-primary text-on-primary text-headline-sm font-semibold py-4 rounded-lg shadow-md flex justify-center items-center gap-2 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Report'}
            <MaterialIcon name="send" className="text-[20px]" />
          </button>
          <p className="text-center text-body-sm text-on-surface-variant flex items-center justify-center gap-1">
            <MaterialIcon name="schedule" className="text-[16px]" />
            Support will follow up on this order
          </p>
        </section>
      </main>
    </div>
  );
}
