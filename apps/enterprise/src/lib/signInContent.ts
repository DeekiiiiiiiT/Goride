import { SERVICE_URLS } from '@/lib/siteContent';
import { urlForDoor } from '@/app/productDoor';

export type SignInLineId = 'rideshare' | 'delivery' | 'enterprise';

export type SignInProduct = {
  id: string;
  name: string;
  description: string;
  /** Absolute URL to that product’s own login (or app home). */
  href: string;
};

export type SignInLine = {
  id: SignInLineId;
  name: string;
  description: string;
  products: SignInProduct[];
};

/** Marketing Sign in = product picker only. Real passwords live on each product host. */
export function getSignInLines(): SignInLine[] {
  return [
    {
      id: 'rideshare',
      name: 'Rideshare',
      description: 'Riders, drivers, and fleet operators.',
      products: [
        {
          id: 'roam',
          name: 'Roam',
          description: 'Book and manage rides.',
          href: SERVICE_URLS.rides,
        },
        {
          id: 'driver',
          name: 'Roam Driver',
          description: 'Drive and earn on the Roam network.',
          href: SERVICE_URLS.driver,
        },
        {
          id: 'fleet',
          name: 'Roam Fleet',
          description: 'Manage vehicles, drivers, and ops.',
          href: SERVICE_URLS.fleet,
        },
      ],
    },
    {
      id: 'delivery',
      name: 'Delivery',
      description: 'Food delivery for customers, couriers, and partners.',
      products: [
        {
          id: 'rush',
          name: 'Roam Rush',
          description: 'Order food and essentials.',
          href: SERVICE_URLS.dash,
        },
        {
          id: 'rush-courier',
          name: 'Rush Courier',
          description: 'Deliver Rush orders.',
          href: SERVICE_URLS.rushCourier,
        },
        {
          id: 'rush-partner',
          name: 'Rush Partner',
          description: 'Merchant kitchen and partner portal.',
          href: SERVICE_URLS.rushPartner,
        },
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'B2B freight forwarder and courier logistics.',
      products: [
        {
          id: 'freight_forwarder',
          name: 'Freight Forwarder',
          description: 'US intake floor and partner receive.',
          href: urlForDoor('freight_forwarder', '/login'),
        },
        {
          id: 'courier',
          name: 'Courier',
          description: 'Mailbox and freight-forwarding desk.',
          href: urlForDoor('courier', '/login'),
        },
      ],
    },
  ];
}
