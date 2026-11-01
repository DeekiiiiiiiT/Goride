/**
 * Telematics adapter (audit §6.9) — no provider wired yet; UI shows Not connected.
 */
export type TelematicsDeviceHealth = "not_connected" | "standby" | "online" | "offline";

export interface TelematicsDiagnosticRow {
  checkName: string;
  value: string | null;
  status: string;
  observedAt: string | null;
}

export interface TelematicsProvider {
  listDevices(orgId: string, assetIds: string[]): Promise<{ assetId: string; health: TelematicsDeviceHealth }[]>;
  getHealth(orgId: string, assetIds: string[]): Promise<Record<string, TelematicsDeviceHealth>>;
  getDiagnostics(orgId: string, assetIds: string[]): Promise<Record<string, TelematicsDiagnosticRow[]>>;
  getObd(orgId: string, vehicleId: string): Promise<Record<string, unknown> | null>;
}

export const nullTelematicsProvider: TelematicsProvider = {
  async listDevices() {
    return [];
  },
  async getHealth(_orgId, assetIds) {
    return Object.fromEntries(assetIds.map((id) => [id, "not_connected" as const]));
  },
  async getDiagnostics(_orgId, assetIds) {
    return Object.fromEntries(assetIds.map((id) => [id, []]));
  },
  async getObd() {
    return null;
  },
};

let active: TelematicsProvider = nullTelematicsProvider;

export function getTelematicsProvider(): TelematicsProvider {
  return active;
}

export function setTelematicsProvider(provider: TelematicsProvider): void {
  active = provider;
}
