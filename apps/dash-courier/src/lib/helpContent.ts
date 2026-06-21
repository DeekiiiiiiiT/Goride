export type HelpArticle = {
  id: string;
  question: string;
  answer: string;
};

export const HELP_ARTICLES: Record<string, HelpArticle[]> = {
  'getting-started': [
    {
      id: 'go-online',
      question: 'How do I go online?',
      answer: 'Tap "Go Online" on the home screen. Allow location and notifications when prompted.',
    },
    {
      id: 'accept-offer',
      question: 'How do I accept a delivery offer?',
      answer: 'When an offer appears, review the details and tap Accept before the timer expires.',
    },
  ],
  'during-delivery': [
    {
      id: 'pickup',
      question: 'What should I do at pickup?',
      answer: 'Confirm all items on the checklist, optionally take a photo, then swipe to confirm pickup.',
    },
    {
      id: 'customer-unavailable',
      question: 'What if the customer is unavailable?',
      answer: 'Wait for the timer, try calling or sending a notification, then follow the resolution options.',
    },
  ],
  earnings: [
    {
      id: 'payouts',
      question: 'When do I get paid?',
      answer: 'Earnings are deposited on your chosen payout schedule — weekly by default.',
    },
    {
      id: 'peak-pay',
      question: 'What is peak pay?',
      answer: 'Peak pay is extra earnings during busy periods. Check the Promotions tab for active boosts.',
    },
  ],
  account: [
    {
      id: 'documents',
      question: 'Which documents do I need?',
      answer: "Driver's license, vehicle registration, insurance (if motorized), and national ID/TRN.",
    },
  ],
  'app-issues': [
    {
      id: 'offline',
      question: 'The app says I am offline',
      answer: 'Check your internet connection and tap Retry. Cached delivery data may still be available.',
    },
  ],
  safety: [
    {
      id: 'emergency',
      question: 'What if I feel unsafe?',
      answer: 'Use the emergency button in Help & Support or call local emergency services immediately.',
    },
  ],
};
