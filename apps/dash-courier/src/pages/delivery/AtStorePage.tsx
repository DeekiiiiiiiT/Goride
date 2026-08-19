import { useRef, useState } from 'react';
import { resolveFulfillmentType } from '@roam/vertical-config';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DeliveryMap } from '@/components/map/DeliveryMap';
import { SlideToConfirm } from '@/components/ui/SlideToConfirm';
import { WaitTimeSheet } from '@/components/delivery/WaitTimeSheet';
import { NavigationPickerSheet } from '@/components/ui/NavigationPickerSheet';
import type { ActiveDelivery } from '@/lib/mockActiveDelivery';
import { openPhoneCall, toDialablePhone } from '@/lib/contactLinks';
import { openNavigationApp } from '@/lib/navigationUrls';
import { submitCourierIssue } from '@/lib/courierApi';
import { toast } from '@/lib/toast';
import { realDispatchProvider } from '@/services/courierDispatch/RealDispatchProvider';
import { ShopAndPickPage } from './ShopAndPickPage';

type AtStorePageProps = {
  delivery: ActiveDelivery;
  onClose: () => void;
  onConfirmPickup: (pickupPhotoUrl?: string) => void;
  onRequestUnassign: () => void;
  onReportIssue: () => void;
};

export function AtStorePage({
  delivery,
  onClose,
  onConfirmPickup,
  onRequestUnassign,
  onReportIssue,
}: AtStorePageProps) {
  const fulfillment = resolveFulfillmentType(delivery.fulfillment_type);

  if (fulfillment === 'pick_and_pack') {
    return (
      <ShopAndPickPage
        delivery={delivery}
        onClose={onClose}
        onConfirmPickup={onConfirmPickup}
        onRequestUnassign={onRequestUnassign}
        onReportIssue={onReportIssue}
      />
    );
  }

  const storeName = delivery.storeName ?? delivery.restaurant;
  const storePhone = toDialablePhone(delivery.storePhone);
  const gps = realDispatchProvider.getLastCoords();
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    delivery.checklist.forEach((item) => {
      initial[item.id] = true;
    });
    return initial;
  });
  const [confirmAll, setConfirmAll] = useState(false);
  const [waitSheetOpen, setWaitSheetOpen] = useState(false);
  const [navPickerOpen, setNavPickerOpen] = useState(false);
  const [pickupPhotoUrl, setPickupPhotoUrl] = useState<string | undefined>();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allItemIds = delivery.checklist.map((item) => item.id);
  const allChecked = allItemIds.every((id) => checked[id]);
  const canConfirm = allChecked && confirmAll;

  const toggleItem = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background">
      <nav className="fixed top-0 z-50 flex min-h-16 pt-safe w-full items-center justify-between bg-surface/80 px-4 backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-container active:scale-95"
        >
          <MaterialIcon name="close" />
        </button>
        <div className="rounded-full bg-secondary-container px-4 py-1.5 shadow-sm">
          <span className="text-label-lg font-semibold uppercase tracking-wide text-on-secondary-container">
            AT STORE
          </span>
        </div>
        <div className="w-10" aria-hidden />
      </nav>

      <main className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 pb-32 pt-[calc(4rem+env(safe-area-inset-top,0px)+1rem)]">
        <section className="mb-6">
          <div className="relative flex overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <div className="w-2 shrink-0 bg-primary" />
            <div className="flex-1 p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="text-headline-md font-bold text-on-surface">{storeName}</h2>
                <span className="flex shrink-0 items-center gap-1 rounded-lg bg-primary-container/10 px-2 py-0.5 text-label-md font-semibold text-primary">
                  <MaterialIcon name="restaurant" className="text-sm" filled />
                  Restaurant · Ready for pickup
                </span>
              </div>
              <p className="mb-4 text-body-md text-on-surface-variant">{delivery.pickupAddressFull}</p>
              <div className="grid grid-cols-2 gap-2">
                {storePhone ? (
                  <button
                    type="button"
                    onClick={() => openPhoneCall(storePhone)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-surface-container-high py-2.5 text-label-lg font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-highest active:scale-95"
                  >
                    <MaterialIcon name="call" />
                    Call Store
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNavPickerOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-surface-container-high py-2.5 text-label-lg font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-highest active:scale-95"
                  >
                    <MaterialIcon name="map" />
                    Open Maps
                  </button>
                )}
                <button
                  type="button"
                  onClick={onReportIssue}
                  className="flex items-center justify-center gap-2 rounded-lg bg-surface-container-high py-2.5 text-label-lg font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-highest active:scale-95"
                >
                  <MaterialIcon name="help" />
                  Get Help
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <button
            type="button"
            onClick={() => setNavPickerOpen(true)}
            className="relative h-40 w-full overflow-hidden rounded-xl border border-outline-variant bg-surface-container shadow-sm active:scale-[0.99]"
          >
            <DeliveryMap
              className="pointer-events-none h-full w-full"
              height="160px"
              interactive={false}
              courierLat={gps.lat}
              courierLng={gps.lng}
              destinationLat={delivery.pickupLat}
              destinationLng={delivery.pickupLng}
              destinationLabel={storeName}
            />
            <div className="absolute right-2 top-2 rounded-full bg-surface p-2 shadow-md">
              <MaterialIcon name="navigation" className="text-primary" />
            </div>
          </button>
        </section>

        <section className="mb-6">
          <h3 className="mb-2 px-1 text-label-lg font-semibold uppercase tracking-wider text-on-surface-variant">
            Order Details (Bag Ready)
          </h3>
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest divide-y divide-outline-variant">
            {delivery.checklist.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center p-4 transition-colors hover:bg-surface-container-low"
              >
                <div className="relative mr-4 flex h-6 w-6 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={!!checked[item.id]}
                    onChange={() => toggleItem(item.id)}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-6 rounded-md border-2 border-outline transition-all peer-checked:border-primary peer-checked:bg-primary" />
                  <MaterialIcon
                    name="check"
                    className="pointer-events-none absolute text-lg text-on-primary opacity-0 peer-checked:opacity-100"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-body-lg text-on-surface">{item.label}</p>
                  {item.note && <p className="text-body-md text-on-surface-variant">{item.note}</p>}
                </div>
              </label>
            ))}
            <label className="flex cursor-pointer items-center bg-primary-container/5 p-4 transition-colors hover:bg-surface-container-low">
              <div className="relative mr-4 flex h-6 w-6 items-center justify-center">
                <input
                  type="checkbox"
                  checked={confirmAll}
                  onChange={() => setConfirmAll(!confirmAll)}
                  className="peer sr-only"
                />
                <div className="h-6 w-6 rounded-md border-2 border-primary transition-all peer-checked:bg-primary" />
                <MaterialIcon
                  name="check"
                  className="pointer-events-none absolute text-lg text-on-primary opacity-0 peer-checked:opacity-100"
                />
              </div>
              <div className="flex-1">
                <p className="text-label-lg font-semibold text-primary">Confirm all items received</p>
                <p className="text-body-md text-on-surface-variant">Check contents before leaving store</p>
              </div>
            </label>
          </div>
          <button
            type="button"
            onClick={() => setWaitSheetOpen(true)}
            className="mt-2 min-h-11 px-2 text-xs font-medium uppercase tracking-wider text-primary underline"
          >
            Order not ready?
          </button>
        </section>

        <section>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadingPhoto(true);
              void import('@/lib/courierFileUpload').then(async ({ uploadAndGetProofUrl }) => {
                const url = await uploadAndGetProofUrl(file, 'proofs');
                setUploadingPhoto(false);
                if (url) setPickupPhotoUrl(url);
              });
            }}
          />
          <button
            type="button"
            disabled={uploadingPhoto}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant py-6 text-on-surface-variant transition-colors hover:bg-surface-container active:scale-[0.98]"
          >
            <MaterialIcon name="add_a_photo" className="mb-2 text-4xl" />
            <span className="text-label-lg font-semibold">
              {uploadingPhoto
                ? 'Uploading…'
                : pickupPhotoUrl
                  ? 'Pickup photo attached'
                  : 'Add pickup photo (optional)'}
            </span>
          </button>
        </section>
      </main>

      <footer className="fixed bottom-0 z-50 w-full border-t border-outline-variant bg-surface px-4 pb-safe pt-4">
        <div className="mx-auto max-w-lg">
          {canConfirm ? (
            <SlideToConfirm
              label="Confirm pickup"
              onComplete={() => onConfirmPickup(pickupPhotoUrl)}
              variant="stacked"
            />
          ) : (
            <SlideToConfirm label="Confirm pickup" onComplete={() => {}} variant="stacked" disabled />
          )}
        </div>
      </footer>

      <WaitTimeSheet
        open={waitSheetOpen}
        onClose={() => setWaitSheetOpen(false)}
        onWait={(minutes) => {
          const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
          void submitCourierIssue(orderId, 'long_wait', `wait:${minutes}min`).then((ok) => {
            if (ok) {
              toast.success('Wait logged', `We'll note a ${minutes}-minute wait.`);
            } else {
              toast.error('Could not log wait', 'Try again or report an issue.');
            }
          });
          setWaitSheetOpen(false);
        }}
        onUnassign={() => {
          setWaitSheetOpen(false);
          onRequestUnassign();
        }}
      />

      <NavigationPickerSheet
        open={navPickerOpen}
        destination={storeName}
        onSelect={(app) => {
          openNavigationApp(app as 'google' | 'waze' | 'apple', {
            lat: delivery.pickupLat,
            lng: delivery.pickupLng,
            address: delivery.pickupAddressFull || delivery.pickupAddress,
          });
          setNavPickerOpen(false);
        }}
        onClose={() => setNavPickerOpen(false)}
      />
    </div>
  );
}
