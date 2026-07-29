import { deliveryFetch } from './partner-api';

export interface TerminalConnectionTokenResult {
  secret: string | null;
  mockMode: boolean;
  message?: string;
}

export async function fetchPosConnectionToken(): Promise<TerminalConnectionTokenResult> {
  return deliveryFetch('/merchant/pos/connection-token', { method: 'POST' });
}

type TerminalInstance = {
  discoverReaders: (opts: { simulated?: boolean }) => Promise<{
    error?: { message?: string };
    discoveredReaders?: Array<{ id: string; label?: string }>;
  }>;
  connectReader: (reader: { id: string }) => Promise<{ error?: { message?: string } }>;
  collectPaymentMethod: (clientSecret: string) => Promise<{
    error?: { message?: string };
    paymentIntent?: unknown;
  }>;
  processPayment: (paymentIntent: unknown) => Promise<{
    error?: { message?: string };
    paymentIntent?: { status?: string };
  }>;
};

let terminalPromise: Promise<TerminalInstance> | null = null;

async function getTerminal(): Promise<TerminalInstance> {
  if (!terminalPromise) {
    terminalPromise = (async () => {
      const mod = await import('@stripe/terminal-js');
      const loadStripeTerminal =
        (mod as { loadStripeTerminal?: () => Promise<unknown> }).loadStripeTerminal ??
        (mod as { default?: { loadStripeTerminal?: () => Promise<unknown> } }).default
          ?.loadStripeTerminal;
      if (!loadStripeTerminal) {
        throw new Error('Stripe Terminal SDK failed to load');
      }
      const StripeTerminal = (await loadStripeTerminal()) as {
        create: (opts: {
          onFetchConnectionToken: () => Promise<string>;
          onUnexpectedReaderDisconnect?: () => void;
        }) => TerminalInstance;
      };
      return StripeTerminal.create({
        onFetchConnectionToken: async () => {
          const result = await fetchPosConnectionToken();
          if (!result.secret) {
            throw new Error(result.message ?? 'Terminal connection token unavailable');
          }
          return result.secret;
        },
      });
    })();
  }
  return terminalPromise;
}

/** Connect reader (simulated when none found) and confirm card-present PaymentIntent. */
export async function collectAndConfirmCardPresentPayment(
  clientSecret: string,
): Promise<{ status: string }> {
  const terminal = await getTerminal();
  const discover = await terminal.discoverReaders({ simulated: true });
  if (discover.error) {
    throw new Error(discover.error.message ?? 'Reader discovery failed');
  }
  const reader = discover.discoveredReaders?.[0];
  if (!reader) {
    throw new Error('No card reader found');
  }
  const connected = await terminal.connectReader(reader);
  if (connected.error) {
    throw new Error(connected.error.message ?? 'Could not connect to reader');
  }
  const collected = await terminal.collectPaymentMethod(clientSecret);
  if (collected.error) {
    throw new Error(collected.error.message ?? 'Card collection failed');
  }
  const processed = await terminal.processPayment(collected.paymentIntent);
  if (processed.error) {
    throw new Error(processed.error.message ?? 'Payment confirmation failed');
  }
  const status = String(processed.paymentIntent?.status ?? 'unknown');
  if (status !== 'succeeded' && status !== 'requires_capture') {
    throw new Error(`Payment not completed (status: ${status})`);
  }
  return { status };
}
