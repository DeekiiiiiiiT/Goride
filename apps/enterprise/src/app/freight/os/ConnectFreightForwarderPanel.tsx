import { PartnerConnectPanel } from '@/app/freight/os/PartnerConnectPanel';

/** Courier attaches to a freight forwarder — on Roam, invite, or off-platform. */
export function ConnectFreightForwarderPanel({ onConnected }: { onConnected?: () => void }) {
  return <PartnerConnectPanel roleAs="courier" onConnected={onConnected} />;
}
