import type { DocStatus } from '../../hooks/useDriverProfileExtras';
import { getDocStatus } from '../../hooks/useDriverProfileExtras';

export type ProfileDocumentItem = {
  id: string;
  label: string;
  status: DocStatus;
  subtitle: string;
};

export function buildProfileDocuments(
  driverRecord: Record<string, unknown> | null,
  vehicle: Record<string, unknown> | null,
): ProfileDocumentItem[] {
  const licenseStatus = getDocStatus(driverRecord?.licenseExpiry as string | undefined);
  const insuranceStatus = getDocStatus(vehicle?.insuranceExpiry as string | undefined);
  const fitnessStatus = getDocStatus(vehicle?.fitnessExpiry as string | undefined);
  const regStatus = getDocStatus(vehicle?.registrationExpiry as string | undefined);

  return [
    { id: 'license', label: "Driver's License", status: licenseStatus.status, subtitle: licenseStatus.text },
    { id: 'insurance', label: 'Vehicle Insurance', status: insuranceStatus.status, subtitle: insuranceStatus.text },
    { id: 'fitness', label: 'Vehicle Inspection (Fitness)', status: fitnessStatus.status, subtitle: fitnessStatus.text },
    { id: 'registration', label: 'Vehicle Registration', status: regStatus.status, subtitle: regStatus.text },
    { id: 'background', label: 'Background Check', status: 'valid', subtitle: 'Valid' },
  ];
}

export function documentsSummary(docs: ProfileDocumentItem[]): string {
  const issues = docs.filter((d) => d.status !== 'valid').length;
  if (issues === 0) return 'All documents up to date';
  if (issues === 1) return '1 item needs attention';
  return `${issues} items need attention`;
}
