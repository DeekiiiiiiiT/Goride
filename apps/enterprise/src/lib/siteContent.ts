export const SERVICE_URLS = {
  rides: 'https://roam-s.co',
  driver: 'https://roamdriver.co',
  haul: 'https://roamhaul.co',
  fleet: 'https://roamfleet.co',
  dash: 'https://roamdash.co',
  privacy: '/privacy',
  terms: '/terms',
  cookies: '/cookies',
  accessibility: '/accessibility',
} as const;

export const STATS = [
  { value: '500M+', label: 'Rides Completed' },
  { value: '12M+', label: 'Drivers & Partners' },
  { value: '1,200+', label: 'Cities Served' },
  { value: '4.9/5', label: 'App Rating' },
] as const;

export type ServiceCard = {
  id: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  icon: 'car' | 'driver' | 'haul' | 'fleet' | 'dash' | 'enterprise';
  variant: 'light' | 'dark' | 'wide';
  accent: string;
};

export const SERVICES: ServiceCard[] = [
  {
    id: 'rides',
    title: 'Roam Rides',
    description:
      'Premium passenger transport with real-time optimization and safety-first protocols for every journey.',
    cta: 'Learn more',
    href: '/rides',
    icon: 'car',
    variant: 'light',
    accent: 'rides-blue',
  },
  {
    id: 'driver',
    title: 'Roam Driver',
    description:
      'Empowering independent earners with flexible scheduling and advanced route analytics.',
    cta: 'Start earning',
    href: '/driver',
    icon: 'driver',
    variant: 'light',
    accent: 'secondary-container',
  },
  {
    id: 'haul',
    title: 'Roam Haul',
    description:
      'Next-generation freight and mid-mile logistics powered by the Roam core engine.',
    cta: 'Logistics platform',
    href: '/haul',
    icon: 'haul',
    variant: 'light',
    accent: 'haul-indigo',
  },
  {
    id: 'fleet',
    title: 'Roam Fleet',
    description:
      'Comprehensive management platform for modern fleets, from maintenance to telematics.',
    cta: 'Manage assets',
    href: '/fleet',
    icon: 'fleet',
    variant: 'dark',
    accent: 'white',
  },
  {
    id: 'dash',
    title: 'Roam Dash',
    description:
      'Hyper-local food and essential delivery optimized for the last-mile sprint.',
    cta: 'View vendors',
    href: '/dash',
    icon: 'dash',
    variant: 'light',
    accent: 'dash-cyan',
  },
];

export type HowItWorksTab = 'rider' | 'driver' | 'business';

export type HowItWorksStep = {
  title: string;
  description: string;
  icon: 'smartphone' | 'verified' | 'location' | 'signup' | 'online' | 'wallet' | 'integrate' | 'optimize' | 'scale';
};

export const HOW_IT_WORKS: Record<
  HowItWorksTab,
  { label: string; accent: 'rides-blue' | 'secondary-container' | 'fleet-slate'; steps: HowItWorksStep[] }
> = {
  rider: {
    label: 'Rider',
    accent: 'rides-blue',
    steps: [
      {
        title: '1. Request',
        description: 'Enter your destination and choose the ride type that fits your needs.',
        icon: 'smartphone',
      },
      {
        title: '2. Match',
        description: 'Get matched with a nearby professional driver in seconds.',
        icon: 'verified',
      },
      {
        title: '3. Arrive',
        description: 'Enjoy a safe, comfortable trip to your destination with real-time tracking.',
        icon: 'location',
      },
    ],
  },
  driver: {
    label: 'Driver',
    accent: 'secondary-container',
    steps: [
      {
        title: '1. Sign Up',
        description: 'Quick online registration and background check to get started.',
        icon: 'signup',
      },
      {
        title: '2. Go Online',
        description: 'Set your own schedule. Open the app and start accepting requests.',
        icon: 'online',
      },
      {
        title: '3. Get Paid',
        description: 'Track your earnings and get paid weekly or cash out instantly.',
        icon: 'wallet',
      },
    ],
  },
  business: {
    label: 'Business',
    accent: 'fleet-slate',
    steps: [
      {
        title: '1. Integrate',
        description: 'Connect your platform with our robust APIs or enterprise dashboard.',
        icon: 'integrate',
      },
      {
        title: '2. Optimize',
        description: 'Leverage our AI to route deliveries and manage fleet efficiency.',
        icon: 'optimize',
      },
      {
        title: '3. Scale',
        description: 'Grow your operations globally with our multi-city infrastructure.',
        icon: 'scale',
      },
    ],
  },
};

export const TESTIMONIALS = [
  {
    quote:
      'The app is so intuitive. I use Roam for my daily commute and it\'s never failed to find me a ride in under 3 minutes.',
    name: 'Sarah Jenkins',
    role: 'Daily Commuter',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuArwSgLMSw9sIr7toL4iIJMW5EuuQ8gqBIelWk306k8vCAwHzVUZyz1HckOL5cWPfklU3N1jk7wKja_Gr8WUhg9TyL5RZLZFl7aqPGBcEVfaTLuSWG082Llm_QaGCmxdQSw2FPRaBfUea3RvRHsiCLKtdWJxyR1TrGoxNo4HDWNXKsNt1se_P_fJzKNBNMczSrmQuY5Vk1-TkMvfgM3UGfWBZ2iC9pBjTYg9YTgfAAlan3_bbDFpWxwlmV8AwSX_ykSUhRwmYxJBA1C',
  },
  {
    quote:
      'Roam Driver gives me the flexibility I need to support my family while pursuing my passion for music on the side.',
    name: 'Marcus Thompson',
    role: 'Roam Partner Driver',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC0SMZ30nW6JhHKeOytxeBxv5XK1GsD96WvHhL18eTogTWSF7PfkLdEkA2JQ3wr8gCe6AiZTlIb2bY-ZBnfzn75yJH1Xg7umdq6IFNvyKj5LiVPuZXrquNRgLF0NI4jZF7luqxf7ERaTahRtMJx4gNjw4V3wGBHTTYBmb2u9WOKAR1Fa2wNSU2M5JUrIJQLkXYAyod6zVKxdZhCCoi7FJb1YRLJuoB_MknBNNWKS2QZO2Mj-VF7ECq2J6MpchjapxAwIMJCboEUfVc-',
  },
  {
    quote:
      'Integrating Roam Haul into our supply chain reduced our last-mile delivery costs by 22% in the first quarter.',
    name: 'Elena Rodriguez',
    role: 'CTO, Nexa Logistics',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCsxeF_aRRDbvEX25V2yBvFVUFp49gIlt1WN7Yd18hkoooCPrJy3HA4MkHRx3P4WgS0FIJZtJYvtLDfZ-GO6OxvFwviQTh6NGdjl9t7ND3XQtOfLsHEWNqpSmEiBoPOhuO3XYtm8PtzvhumNMRVRucMGsPGt50ulV7-06F0VhY7Hk9WIxtWK-7mC63p5nHjInsckqfn0cEel0LOikQ-IaSi2oN62mQ4UAgK0eIglvl0k0w6xx4FzNuGVMQlJQUVg8Rq01d2IqdT5cov',
  },
] as const;
