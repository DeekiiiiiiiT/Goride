import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { toast } from '@/lib/toast';
import { courierPhoneHref, type TrackingOrder } from '@/lib/trackingContent';
import { CustomerOrderChatWrap } from '@/components/CustomerOrderChatWrap';
import { RushChatUnreadDot } from '@roam/rush-chat';

type Courier = TrackingOrder['courier'];

export function CourierProfileCard({
  courier,
  compact,
  order,
}: {
  courier: Courier;
  compact?: boolean;
  order?: TrackingOrder;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-4">
        <div className="relative">
          <img src={courier.avatar} alt={courier.name} className="w-14 h-14 rounded-full object-cover border-2 border-surface shadow-sm" />
          <div className="absolute -bottom-1 -right-1 bg-surface rounded-full p-0.5 shadow-sm">
            <div className="bg-primary text-on-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              {courier.rating} <MaterialIcon name="star" className="text-[10px]" filled />
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-headline-sm font-semibold">{courier.name}</h3>
          <p className="text-body-sm text-on-surface-variant">
            {courier.vehicle} • {courier.plate}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low rounded-xl p-4 mb-6 border border-surface-variant flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative">
          <img src={courier.avatar} alt={courier.name} className="w-14 h-14 rounded-full object-cover border-2 border-surface" />
          <div className="absolute -bottom-1 -right-1 bg-surface rounded-full p-1 shadow-sm">
            <div className="bg-primary rounded-full w-5 h-5 flex items-center justify-center">
              <MaterialIcon name="two_wheeler" className="text-[12px] text-on-primary" />
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-headline-sm font-semibold">{courier.name}</h3>
          <div className="flex items-center gap-1 mt-1">
            <MaterialIcon name="star" className="text-[14px] text-[#F59E0B]" filled />
            <span className="text-label-sm text-on-surface-variant">
              {courier.rating} • {courier.deliveries}
            </span>
          </div>
        </div>
      </div>
      <CourierActions phone={courier.phone} order={order} />
    </div>
  );
}

export function CourierActions({ phone, order }: { phone?: string; order?: TrackingOrder }) {
  const callHref = courierPhoneHref(phone, 'tel');

  const openHref = (href: string | null, missing: string) => {
    if (!href) {
      toast.info(missing);
      return;
    }
    window.location.href = href;
  };

  const chatButton = order ? (
    <CustomerOrderChatWrap
      orderId={order.id}
      status={order.status}
      courierId={order.courierId}
      pickedUpAt={order.pickedUpAt}
      deliveredAt={order.deliveredAt}
      pair="customer_courier"
      peerLabel={order.courier?.name || 'Your courier'}
    >
      {(openChat, ctx) => (
        <button
          type="button"
          aria-label="Message courier"
          onClick={openChat}
          className="relative w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center"
        >
          <MaterialIcon name="chat" />
          <RushChatUnreadDot show={ctx.unreadCount > 0} className="right-0.5 top-0.5" />
        </button>
      )}
    </CustomerOrderChatWrap>
  ) : (
    <button
      type="button"
      aria-label="Message courier"
      onClick={() => toast.info('In-app chat opens once your courier is assigned')}
      className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center"
    >
      <MaterialIcon name="chat" />
    </button>
  );

  return (
    <div className="flex gap-2">
      {chatButton}
      <button
        type="button"
        aria-label="Call courier"
        onClick={() => openHref(callHref, 'Courier phone is not available yet')}
        className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center"
      >
        <MaterialIcon name="call" />
      </button>
    </div>
  );
}
