import { SERVICE_URLS } from '@/lib/siteContent';

export const RIDES_APP_URL = SERVICE_URLS.rides;

export const RIDES_FEATURES = [
  {
    title: 'Book for yourself or others',
    description:
      'Seamlessly arrange transportation for family, colleagues, or guests with ease.',
    icon: 'user-plus' as const,
  },
  {
    title: 'Schedule rides in advance',
    description: 'Lock in your transport days or hours early for ultimate peace of mind.',
    icon: 'calendar' as const,
  },
  {
    title: 'Real-time tracking',
    description: 'Watch your ride approach in high-fidelity on our interactive urban map.',
    icon: 'locate' as const,
  },
  {
    title: 'Multiple payment options',
    description: 'Card, digital wallets, or corporate accounts — pay your way every time.',
    icon: 'wallet' as const,
  },
  {
    title: 'Fare estimates upfront',
    description: 'Transparent pricing logic. Know the cost before you commit to the journey.',
    icon: 'receipt' as const,
  },
  {
    title: 'Safety first',
    description: 'In-app emergency assistance and real-time trip sharing with loved ones.',
    icon: 'shield-heart' as const,
  },
];

export const RIDES_SERVICE_TYPES = [
  {
    title: 'Standard Rides',
    description: 'Reliable every-day transport with our vetted partner network.',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBkRnNgdXVW1R1NU9u8a0KWyYTQBTD63t5h4qNPXOTKau1hCl6QZ3RskWjqIDJKzBIrehut5OFw1biGbtQrmTbaaQA3NyUZbCsn1GUjmXNtDjo8dSGQq1C6SqruRico7CfhEygvR0a7A3IVnpsadldTSzcpRj2k7ShDkR7imf4L1qxP93aOUPhJAS5dkntK4AthvPQLw3PZp_M_e_z-so5K8V0ifXRY091EuZGjqqWmqpyfcz5Wkp9p4e_oyVOIZyTGWW8Es7fhjhrx',
  },
  {
    title: 'Comfort Rides',
    description: 'Premium vehicles with top-rated drivers for an elevated experience.',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAoJXifrI305kS3LWnPkaXhrgJBBPMT2Sc6bJOkDSA8S3y0eM_aJWJGGRdsWqdS28xPiGLQPIp_IyoJtg1xKQq-QNZeCGsR8gtHWKUIObVoF6ZiFEuttsPxu5PqHXvOp7yl1GuSzSr4OEFo_HGcU1GWFkeQiHJE0HyQ3VCzcr-I2W0mHcXtMld_pw68qYQsBBe560zqh7On694H0ABMQzTNFZvihJr_x23NAaAM-vLw-L_inG9EIy5gk5EdnpJwR402tfWce-p8Qorf',
  },
  {
    title: 'Scheduled Rides',
    description: 'Peace of mind for your future trips. Book up to 30 days in advance.',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBjBFeZ0J3w-1CGh1l6Wdi6RwAovIlcxSD1RXLWKc_8S_UZX_5iMqQN0_VvaYrFHcY2p8w2fF-kc1Su59sp54PrsgwN4jQ8eZGKduiYUKbEU6XdCG2MR-5hU7IS7M2vIgQh59U2R4lb6hWHc0Zix5ZaR6qo89F9Oi8aAL2GaXQApuuVKrz4kqrjij_bnsl8xzUcOBTXn-eqIqK0fjx9tnAk-WxClbBJpRZAYjAgsEaqJJzO8KEMsTAaGuuYhAod3AoIEdtu0Kl4yGCA',
  },
  {
    title: 'Event Transport',
    description: 'Group travel logistics for weddings, conferences, and celebrations.',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCQvB6v4OY9Fj6W2D2moOBggvDIJCKDi6j8jSlajWhEEZazzo9omeErLHo6CyDqXwzMLOSckmnCU3ciZCMdeemEn80uQ_LeJDx8pwxTQeRW_g8b1RRQO3tfpyjU2t9CehUqIn8V88hPMrp-FR6Pw7MZNhx2JPR52RCph85bdLHfk_U3GaKoSiIvElx1JHIT_pqOn0bRzrts9ftAV076PFpJhn4t9r4Yzayj4_ef4OWMbfW3yv6j_55gpzrXvypCISFhihQz3eH6AnEr',
  },
];

export const RIDES_SAFETY_ITEMS = [
  {
    title: 'Driver Verification',
    description: 'Rigorous background checks and ongoing performance monitoring.',
    icon: 'verified' as const,
  },
  {
    title: '24/7 Kinetic Support',
    description: 'A dedicated response team ready to assist you at any time.',
    icon: 'headphones' as const,
  },
  {
    title: 'In-App Safety Features',
    description: 'Share trip status and access emergency services with one tap.',
    icon: 'shield-alert' as const,
  },
];

export const RIDES_PRICING_POINTS = [
  'No Surge Surprises',
  'Corporate Billing',
  'Loyalty Rewards',
];

export const RIDES_APP_STEPS = [
  {
    step: '01',
    title: 'Dynamic Map View',
    description: 'Real-time vector rendering of your city grid.',
  },
  {
    step: '02',
    title: 'One-Tap Booking',
    description: 'From open to order in under 5 seconds.',
  },
  {
    step: '03',
    title: 'Integrated Payments',
    description: 'Secure, invisible transactions upon arrival.',
  },
];

export const SAFETY_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDoblvRXT3aouCj-O2wgebvjZVAUr4hfNi9Kv6NCjbEaBTxk-SxPqi7y88p9J7huMK2z-dARelbVpKV7sN-hFgoPvD8c1Cm6ePa1uRMediJfj_Eac8bRDMLP6m7x_Fm1q53blarrGtrojm9rsV_o74YluwpZ6FYsz2ljzBKZ-Tzn3vBxC4ILWS1B68sLNCTOlL01Vih8oLwn2L1qqOyzvnbfwLKRbYoGSdxdZ4K9AE34WUE-3KOk7aGq5wyTujvPeG6ksVTSSfNXor-';
