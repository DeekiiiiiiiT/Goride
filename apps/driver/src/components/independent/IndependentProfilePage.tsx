import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Car,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  IdCard,
  Loader2,
  Shield,
  Star,
  User,
  Wrench,
} from 'lucide-react';
import {
  Button,
  cn,
  Input,
  Label,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@roam/ui';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { getDocStatus, useDriverProfileExtras, type DocStatus } from '../../hooks/useDriverProfileExtras';
import { api } from '../../services/api';

type Props = {
  onNavigate: (page: string) => void;
};

const cardClass =
  'rounded-[24px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:bg-slate-900 dark:shadow-none dark:border dark:border-slate-800';

export function IndependentProfilePage({ onNavigate }: Props) {
  const { user } = useAuth();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  const { vehicle, metrics, loading: extrasLoading } = useDriverProfileExtras(driverRecord, user);
  const [personalOpen, setPersonalOpen] = useState(false);

  const avatarUrl =
    (driverRecord?.avatarUrl as string | undefined) ||
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;

  const name = driverRecord?.name || user?.user_metadata?.name || 'Driver';
  const displayId = driverRecord?.driverId || driverRecord?.id || user?.id || 'UNKNOWN';
  const idShort = `DRV-${String(displayId).replace(/-/g, '').slice(0, 5).toUpperCase()}`;
  const initials = name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const rating = String(metrics?.ratingLast500 ?? driverRecord?.rating ?? '5.0');
  const statusLabel = (driverRecord?.status as string) || 'Active';
  const isActive = statusLabel.toLowerCase() === 'active';

  const licenseStatus = getDocStatus(driverRecord?.licenseExpiry as string | undefined);
  const insuranceStatus = getDocStatus(vehicle?.insuranceExpiry as string | undefined);
  const fitnessStatus = getDocStatus(vehicle?.fitnessExpiry as string | undefined);
  const regStatus = getDocStatus(vehicle?.registrationExpiry as string | undefined);

  const vehicleTitle = vehicle
    ? `${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() || 'Assigned vehicle'
    : 'No vehicle assigned';
  const vehicleSubtitle = vehicle
    ? `${vehicle.color ?? '—'} • ${vehicle.licensePlate ?? vehicle.plateNumber ?? '—'}`
    : 'Add your vehicle details';

  const loading = driverLoading || extrasLoading;

  return (
    <div className="flex flex-col gap-8">
      <section className={cn(cardClass, 'flex flex-col items-center p-8 text-center')}>
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-[#004ac6]" />
            <p className="text-sm text-slate-500">Loading profile…</p>
          </div>
        ) : (
          <>
            <div className="relative mb-6">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-100 text-3xl font-bold text-[#004ac6] shadow-md dark:border-slate-800 dark:bg-slate-800">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              {isActive && (
                <div
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white dark:border-slate-900"
                  aria-hidden
                >
                  <BadgeCheck className="h-4 w-4" />
                </div>
              )}
            </div>
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {name.toUpperCase()}
            </h1>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">ID: {idShort}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-4 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                {statusLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-4 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                {rating} Rating
              </span>
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-4 px-1 text-lg font-semibold text-slate-900 dark:text-white">Documents</h2>
        <div className={cn(cardClass, 'divide-y divide-slate-100 overflow-hidden dark:divide-slate-800')}>
          <DocumentRow
            icon={<IdCard className="h-6 w-6 text-[#004ac6]" />}
            label="Driver's License"
            status={licenseStatus.status}
            subtitle={licenseStatus.text}
          />
          <DocumentRow
            icon={<Shield className="h-6 w-6 text-[#004ac6]" />}
            label="Vehicle Insurance"
            status={insuranceStatus.status}
            subtitle={insuranceStatus.text}
          />
          <DocumentRow
            icon={<Wrench className="h-6 w-6 text-[#004ac6]" />}
            label="Vehicle Inspection (Fitness)"
            status={fitnessStatus.status}
            subtitle={fitnessStatus.text}
          />
          <DocumentRow
            icon={<FileText className="h-6 w-6 text-[#004ac6]" />}
            label="Vehicle Registration"
            status={regStatus.status}
            subtitle={regStatus.text}
          />
          <DocumentRow
            icon={<ClipboardCheck className="h-6 w-6 text-[#004ac6]" />}
            label="Background Check"
            status="valid"
            subtitle="Valid"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-4 px-1 text-lg font-semibold text-slate-900 dark:text-white">Vehicle</h2>
        <button
          type="button"
          onClick={() => onNavigate('vehicle')}
          className={cn(
            cardClass,
            'flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-slate-50 active:scale-[0.99] dark:hover:bg-slate-800/80',
          )}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              {vehicle?.image ? (
                <img
                  src={String(vehicle.image)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Car className="h-8 w-8 text-slate-300" />
              )}
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white">{vehicleTitle}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{vehicleSubtitle}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </button>
      </section>

      <section>
        <h2 className="mb-4 px-1 text-lg font-semibold text-slate-900 dark:text-white">Settings</h2>
        <button
          type="button"
          onClick={() => setPersonalOpen(true)}
          className={cn(
            cardClass,
            'flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-slate-50 active:scale-[0.99] dark:hover:bg-slate-800/80',
          )}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <User className="h-6 w-6 text-slate-500" />
            </div>
            <p className="font-semibold text-slate-900 dark:text-white">Personal Information</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
        </button>
      </section>

      <PersonalInfoSheet
        open={personalOpen}
        onOpenChange={setPersonalOpen}
        name={name}
        email={driverRecord?.email || user?.email || ''}
        phone={(driverRecord?.phone as string) || '—'}
        driverId={idShort}
      />
    </div>
  );
}

function DocumentRow({
  icon,
  label,
  status,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  status: DocStatus;
  subtitle: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-6 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100/80 dark:bg-blue-950/40">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white">{label}</p>
          <p
            className={cn(
              'text-sm',
              status === 'error'
                ? 'text-red-600 dark:text-red-400'
                : status === 'warning'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400',
            )}
          >
            {subtitle}
          </p>
        </div>
      </div>
      {status === 'valid' ? (
        <CheckCircle2 className="h-6 w-6 shrink-0 fill-emerald-500 text-emerald-500" />
      ) : status === 'warning' ? (
        <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
      ) : (
        <AlertCircle className="h-6 w-6 shrink-0 text-red-500" />
      )}
    </div>
  );
}

function PersonalInfoSheet({
  open,
  onOpenChange,
  name,
  email,
  phone,
  driverId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  email: string;
  phone: string;
  driverId: string;
}) {
  const [bankInfo, setBankInfo] = useState({
    accountName: '',
    bankName: '',
    branch: '',
    accountNumber: '',
    accountType: 'Savings',
  });
  const [hasSavedBankInfo, setHasSavedBankInfo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { driverRecord } = useCurrentDriver();

  useEffect(() => {
    if (driverRecord?.bankInfo) {
      setBankInfo(driverRecord.bankInfo);
      if (driverRecord.bankInfo.accountNumber) setHasSavedBankInfo(true);
    }
  }, [driverRecord]);

  const saveBankInfo = async () => {
    if (!driverRecord) return;
    setIsSaving(true);
    try {
      await api.saveDriver({ ...driverRecord, bankInfo });
      toast.success('Bank information saved');
      setHasSavedBankInfo(true);
    } catch {
      toast.error('Failed to save bank information');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle>Personal Information</SheetTitle>
          <SheetDescription>Manage your personal details and contact info.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6">
          <Field label="Full Name" value={name} />
          <Field label="Email Address" value={email} />
          <Field label="Phone Number" value={phone} />
          <Field label="Driver ID" value={driverId} mono />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => toast.message('Change requests are reviewed by support')}
          >
            Request Change
          </Button>
          <Separator />
          <h4 className="font-semibold text-slate-900 dark:text-white">Bank Account Information</h4>
          <EditableField
            label="Name on Account"
            value={bankInfo.accountName}
            onChange={(v) => setBankInfo((p) => ({ ...p, accountName: v }))}
            readOnly={hasSavedBankInfo}
          />
          <EditableField
            label="Bank Name"
            value={bankInfo.bankName}
            onChange={(v) => setBankInfo((p) => ({ ...p, bankName: v }))}
            readOnly={hasSavedBankInfo}
          />
          <EditableField
            label="Branch"
            value={bankInfo.branch}
            onChange={(v) => setBankInfo((p) => ({ ...p, branch: v }))}
            readOnly={hasSavedBankInfo}
          />
          <EditableField
            label="Account Number"
            value={bankInfo.accountNumber}
            onChange={(v) => setBankInfo((p) => ({ ...p, accountNumber: v }))}
            readOnly={hasSavedBankInfo}
          />
          {hasSavedBankInfo ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => toast.message('Contact support to update bank details')}
            >
              Request Change
            </Button>
          ) : (
            <Button className="w-full bg-[#004ac6] hover:bg-[#003ea8]" onClick={() => void saveBankInfo()} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save Bank Information'
              )}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} readOnly className={cn('bg-slate-50 dark:bg-slate-900', mono && 'font-mono')} />
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className={readOnly ? 'bg-slate-50 dark:bg-slate-900' : undefined}
      />
    </div>
  );
}
