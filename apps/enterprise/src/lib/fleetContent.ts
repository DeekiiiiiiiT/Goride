import { SERVICE_URLS } from '@/lib/siteContent';

export const FLEET_APP_URL = SERVICE_URLS.fleet;

export const FLEET_DASHBOARD_HERO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBh6LennUgq03kCz4laz2pLnKjUN3VJo3K8ABAH5UnFZhGI6G52IXsBuGZ6v0vP0nGftE1xoU54LlE05lqXTEokswWmn7EH-89YpJndu34ZdbknIS5DbmM6rmF23OfN9GvETERl0nseYG8BKT769Kvw7m-WYeZhlCaDICOQ4CYKb_zQd6zaq0hbzPxk2NiHGq46ErvZrOYrjnWny92NvrS8bEf6uEqiGZu1q97kyjwm2tM94z223UbjzXHUk7cZUUKJrsYeiOv42LZJ';

export const FLEET_COMMAND_CENTER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuABFFLNiWWBFSTC9xnERtqLRAJNitX3KwRD1DoKWNk9wyTts030i47DTXRRA6volnZwgC6foll8FVLElOEb3wI-mj_a_QcvdZiw4vIc7pMQHLsPECni2q5Cxq76vc1naH0AkvZkH1HuVBNbdsXkot-BPu6BWJ42GXdEZXsFyJrXTceIgB7GfKZIV75hS8r4VHqPWsY7kQ_oZxYNObVb-cD9XhDakfUSEAMIf_VdLx9S26DMlJol7XT2NdoLRsiZZHCIbotAzGWp48nh';

export const FLEET_FEATURES = [
  { title: 'Driver Management', description: 'Unified profile system for licensing, performance, and scheduling.', icon: 'badge', accent: 'secondary' },
  { title: 'Vehicle Tracking', description: 'GPS telemetry updated every 3 seconds with history playback.', icon: 'location', accent: 'rides-blue' },
  { title: 'Trip Logs', description: 'Automated digital logs compliant with international standards.', icon: 'history', accent: 'haul-indigo' },
  { title: 'Fuel Management', description: 'Fuel card integration and real-time consumption auditing.', icon: 'fuel', accent: 'dash-cyan' },
  { title: 'Toll Recon', description: 'Automatic matching of toll expenses to specific vehicle routes.', icon: 'receipt', accent: 'secondary' },
  { title: 'Maintenance', description: 'Predictive scheduling based on real-time mileage sensors.', icon: 'build', accent: 'rides-blue' },
  { title: 'Dashboards', description: 'Customizable KPIs for operational efficiency and overhead.', icon: 'monitoring', accent: 'haul-indigo' },
  { title: 'Finances', description: 'End-to-end financial reporting with tax export capability.', icon: 'wallet', accent: 'dash-cyan' },
  { title: 'User Roles', description: 'Granular permissions for owners, admins, and drivers.', icon: 'security', accent: 'secondary' },
  { title: 'Bulk Tools', description: 'Seamless CSV/Excel tools for mass data synchronization.', icon: 'import', accent: 'rides-blue' },
] as const;

export const FLEET_USE_CASES = [
  { title: 'Rideshare Owners', description: 'Manage fleets of 10 to 1,000+ vehicles with simplified payout logic.', icon: 'taxi', accent: 'rides-blue' },
  { title: 'Delivery Teams', description: 'Optimize last-mile efficiency and verify every drop-off with photos.', icon: 'delivery', accent: 'haul-indigo' },
  { title: 'Corporate Fleets', description: 'Centralize employee transport and executive travel with full auditing.', icon: 'business', accent: 'dash-cyan' },
  { title: 'Rentals', description: 'Track utilization rates and automate return checklists seamlessly.', icon: 'rental', accent: 'secondary' },
] as const;

export const FLEET_INTEGRATIONS = [
  { label: 'REST API', icon: 'api' },
  { label: 'SAP / Oracle ERP', icon: 'erp' },
  { label: 'Fuel Cards', icon: 'card' },
  { label: 'Google Maps Platform', icon: 'map' },
] as const;

export const FLEET_PRICING = [
  {
    tier: 'Small',
    price: '$99',
    period: '/mo',
    features: ['Up to 10 vehicles', 'Real-time tracking', 'Mobile App access'],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    tier: 'Growing',
    price: '$299',
    period: '/mo',
    badge: 'Recommended',
    features: ['Up to 50 vehicles', 'Advanced Telematics', 'Fuel & Toll Recon', 'API Access'],
    cta: 'Choose Pro',
    highlighted: true,
  },
  {
    tier: 'Enterprise',
    price: 'Custom',
    period: '',
    features: ['Unlimited vehicles', 'White-label options', 'Dedicated Manager', '24/7 Priority Support'],
    cta: 'Contact Sales',
    highlighted: false,
  },
] as const;

export const FLEET_TESTIMONIALS = [
  {
    quote: "Roam's precision is unmatched. We reduced our fuel overhead by 22% in the first quarter of switching our fleet tracking to their platform.",
    name: 'Marcus Chen',
    role: 'CEO, SwiftLink Logistics',
  },
  {
    quote: 'The automated toll reconciliation saved our accounting department hundreds of hours every month. It\'s the most frictionless tool we use.',
    name: 'Sarah Jenkins',
    role: 'Operations Director, Metro Rides',
  },
] as const;
