import { useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { formatTimeAgo } from '../../lib/partner-utils';
import { getItemModifiersText, HANDOFF_CHECKLIST_ITEMS } from '../../lib/order-utils';
import { Order } from '../../types/order';

interface ReadyOrderDetailProps {
  order: Order;
  onBack: () => void;
  onConfirmPickup: () => void;
  isSubmitting?: boolean;
}

export default function ReadyOrderDetail({
  order,
  onBack,
  onConfirmPickup,
  isSubmitting = false,
}: ReadyOrderDetailProps) {
  const [checklist, setChecklist] = useState<Record<number, boolean>>({
    0: false,
    1: false,
    2: false,
  });

  const courierAssigned = Boolean(order.courier_id);
  const courierName = order.courier?.display_name?.trim() || null;
  const courierVehicle = order.courier?.vehicle_type?.trim() || null;
  const courierPhone = order.courier?.phone?.trim() || null;
  const readySince = order.ready_at;
  const checklistComplete = HANDOFF_CHECKLIST_ITEMS.every((_, i) => checklist[i]);
  const canConfirmPickup = courierAssigned && checklistComplete && !isSubmitting;

  const toggleChecklist = (index: number) => {
    setChecklist((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const callCourier = () => {
    if (!courierPhone) return;
    window.location.href = `tel:${courierPhone}`;
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background">
      <header className="sticky top-0 z-50 mx-auto flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile shadow-sm">
        <div className="flex items-center gap-inset-xs">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full p-2 text-on-surface-variant transition-all hover:bg-surface-container-low active:scale-95"
            aria-label="Back"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-md font-semibold text-on-surface">
            Order #{order.order_number}
          </h1>
        </div>
        <button
          type="button"
          className="rounded-full px-3 py-2 text-label-md font-semibold text-primary transition-colors hover:bg-surface-container-low active:scale-95"
        >
          Help
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col gap-inset-sm px-margin-mobile pb-[100px] pt-inset-sm">
        <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
          <div className="flex flex-col gap-inset-base">
            <div className="flex items-center gap-inset-xs">
              <span className="rounded-sm bg-primary-container px-2 py-1 text-label-md font-semibold uppercase tracking-wider text-on-primary-container">
                READY
              </span>
              {readySince && (
                <span className="text-body-sm text-on-surface-variant">
                  Since {formatTimeAgo(readySince)}
                </span>
              )}
            </div>
            <p className="text-body-lg font-semibold text-on-surface">Waiting for courier</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary-container bg-surface-container text-primary">
            <MaterialIcon name="inventory_2" size={28} filled />
          </div>
        </div>

        <div className="flex flex-col gap-inset-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-inset-xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-variant text-on-surface-variant">
                <MaterialIcon name="person" size={28} />
              </div>
              <div className="flex flex-col">
                <span className="text-body-lg font-semibold">
                  {courierAssigned
                    ? courierName || 'Courier assigned'
                    : 'Assigning courier'}
                </span>
                <span className="text-body-sm text-on-surface-variant">
                  {courierAssigned
                    ? courierVehicle || 'En route to restaurant'
                    : 'Courier will be assigned soon'}
                </span>
              </div>
            </div>
            <button
              type="button"
              disabled={!courierPhone}
              onClick={callCourier}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant text-primary transition-colors hover:bg-surface-container-low disabled:opacity-40"
              aria-label="Call courier"
            >
              <MaterialIcon name="call" size={20} />
            </button>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-variant">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: courierAssigned ? '85%' : '25%' }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
          <div className="mb-inset-xs flex items-center gap-inset-xs">
            <MaterialIcon name="person" size={20} className="text-on-surface-variant" />
            <h2 className="text-headline-md font-semibold text-on-surface">{order.customer.name}</h2>
          </div>
        </div>

        <div className="flex flex-col gap-inset-xs rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
          <h3 className="mb-2 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
            Order Items ({order.items.length})
          </h3>
          {order.items.map((item, index) => {
            const note = getItemModifiersText(item);
            return (
              <div
                key={index}
                className="flex items-start justify-between border-b border-outline-variant/30 py-2 last:border-0"
              >
                <div className="flex items-start gap-inset-xs">
                  <span className="w-6 text-center text-body-lg font-semibold">{item.quantity}x</span>
                  <div className="flex flex-col">
                    <span className="text-body-lg text-on-surface">{item.name}</span>
                    {note && (
                      <span className="text-body-sm text-on-surface-variant">{note}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-inset-xs rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
          <h3 className="mb-2 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
            Handoff Checklist
          </h3>
          {HANDOFF_CHECKLIST_ITEMS.map((label, index) => (
            <label
              key={label}
              className="flex cursor-pointer items-center gap-inset-xs py-2 transition-colors group"
            >
              <input
                type="checkbox"
                checked={Boolean(checklist[index])}
                onChange={() => toggleChecklist(index)}
                className="h-6 w-6 rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary focus:ring-offset-0"
              />
              <span className="text-body-lg text-on-surface transition-colors group-hover:text-primary">
                {label}
              </span>
            </label>
          ))}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-outline-variant bg-surface-container-lowest p-margin-mobile pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <button
          type="button"
          disabled={!canConfirmPickup}
          onClick={onConfirmPickup}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-headline-md font-semibold text-on-primary transition-opacity disabled:cursor-not-allowed disabled:bg-surface-variant disabled:text-on-surface-variant disabled:opacity-70"
        >
          <MaterialIcon name="local_shipping" />
          {isSubmitting ? 'CONFIRMING…' : 'CONFIRM PICKUP'}
        </button>
        <p className="mt-2 text-center text-label-sm text-on-surface-variant">
          {!courierAssigned
            ? 'Available when a courier is assigned'
            : !checklistComplete
              ? 'Complete the handoff checklist first'
              : 'Confirm when the courier has the order'}
        </p>
      </div>
    </div>
  );
}
