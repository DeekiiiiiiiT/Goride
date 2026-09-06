import React, { useEffect, useMemo, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { findMatchingDriver } from '../../utils/identityMatcher';
import { AddDriverLicenseStep } from './AddDriverLicenseStep';
import { AddDriverDetailsStep } from './AddDriverDetailsStep';
import { AddDriverModalFooter } from './AddDriverModalFooter';
import {
  type AddDriverFormValues,
  type LicenseSubStep,
  clearAddDriverDraft,
  defaultAddDriverValues,
  loadAddDriverDraft,
  saveAddDriverDraft,
} from './addDriverForm';

interface AddDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDriverAdded: (driver: unknown) => void;
}

export function AddDriverModal({ isOpen, onClose, onDriverAdded }: AddDriverModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [step, setStep] = useState(1);
  const [licenseStep, setLicenseStep] = useState<LicenseSubStep>('front-upload');
  const [licenseFront, setLicenseFront] = useState<File | null>(null);
  const [licenseBack, setLicenseBack] = useState<File | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const { data: existingDrivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.getDrivers(),
    enabled: isOpen,
    staleTime: 2 * 60 * 1000,
  });

  const methods = useForm<AddDriverFormValues>({
    defaultValues: defaultAddDriverValues,
    mode: 'onSubmit',
  });
  const { getValues, setValue, reset, watch, handleSubmit } = methods;

  const watchedName = watch(['firstName', 'lastName', 'licenseNumber']);
  const matchedDriver = useMemo(() => {
    const [firstName, lastName, licenseNumber] = watchedName;
    if (!firstName && !lastName && !licenseNumber) return null;
    return findMatchingDriver(
      { name: `${firstName} ${lastName}`.trim(), externalId: licenseNumber },
      existingDrivers as Parameters<typeof findMatchingDriver>[1],
    );
  }, [watchedName, existingDrivers]);

  // Restore draft when opening
  useEffect(() => {
    if (!isOpen) return;
    const draft = loadAddDriverDraft();
    if (draft) {
      reset(draft.values);
      setStep(draft.step);
      setLicenseStep(draft.licenseStep);
    }
  }, [isOpen, reset]);

  // Persist text fields (files stay in memory only)
  useEffect(() => {
    if (!isOpen) return;
    const sub = watch((values) => {
      saveAddDriverDraft({
        step,
        licenseStep,
        values: values as AddDriverFormValues,
      });
    });
    return () => sub.unsubscribe();
  }, [isOpen, watch, step, licenseStep]);

  useEffect(() => {
    if (!isOpen) return;
    saveAddDriverDraft({ step, licenseStep, values: getValues() });
  }, [step, licenseStep, isOpen, getValues]);

  const handleScanFront = async () => {
    if (!licenseFront) {
      toast.error("Please upload the front of the Driver's License");
      return;
    }
    setIsScanning(true);
    try {
      const res = await api.parseDocument(licenseFront, 'license', undefined);
      if (res.success && res.data) {
        if (res.data.firstName) setValue('firstName', res.data.firstName);
        if (res.data.lastName) setValue('lastName', res.data.lastName);
        if (res.data.middleName) {
          const parts = String(res.data.middleName).split(' ');
          setValue('middleName', parts[0] || '');
          if (parts.length > 1) setValue('middleName2', parts.slice(1).join(' '));
        }
        let code = res.data.countryCode || '+1';
        const nat = String(res.data.nationality || '').toUpperCase();
        if (nat.includes('JAMAICA') || nat.includes('JM')) code = '+876';
        setValue('countryCode', code);
        if (res.data.nationality) setValue('nationality', res.data.nationality);
        if (res.data.licenseNumber) setValue('licenseNumber', res.data.licenseNumber);
        if (res.data.expirationDate) setValue('licenseExpiry', res.data.expirationDate);
        if (res.data.dateOfBirth || res.data.dob) {
          setValue('dob', res.data.dateOfBirth || res.data.dob);
        }
        if (res.data.sex) setValue('sex', res.data.sex);
        if (res.data.class) setValue('licenseClass', res.data.class);
        if (res.data.collectorate) setValue('collectorate', res.data.collectorate);
        toast.success('Front license scanned successfully. Please review details.');
      } else {
        throw new Error('Could not extract data');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('503') || msg.includes('not configured')) {
        toast.error('AI Service unavailable. Please enter details manually.');
      } else {
        toast.error('Could not read license. Please verify manually.');
      }
    } finally {
      setIsScanning(false);
      setLicenseStep('front-review');
    }
  };

  const handleScanBack = async () => {
    if (!licenseBack) {
      toast.error("Please upload the back of the Driver's License");
      return;
    }
    setIsScanning(true);
    try {
      // Prefer front file when present; API accepts File (L-5 — never pass undefined).
      const frontForScan = licenseFront ?? licenseBack;
      const res = await api.parseDocument(frontForScan, 'license', licenseBack);
      if (res.success && res.data) {
        if (res.data.licenseToDrive) setValue('licenseToDrive', res.data.licenseToDrive);
        if (res.data.controlNumber) setValue('controlNumber', res.data.controlNumber);
        if (res.data.nationality) setValue('nationality', res.data.nationality);
        if (res.data.originalIssueDate) setValue('originalIssueDate', res.data.originalIssueDate);
        toast.success('Back license scanned successfully! Please review.');
      }
    } catch {
      toast.error('Could not scan back of license. Please verify manually.');
    } finally {
      setIsScanning(false);
      setLicenseStep('back-review');
    }
  };

  const handleScanAddress = async () => {
    if (!proofFile) return;
    setIsScanning(true);
    try {
      const res = await api.parseDocument(proofFile, 'address');
      if (res.success && res.data?.address) {
        setValue('address', res.data.address);
        toast.success('Address extracted!');
      } else {
        toast.info('Could not extract address automatically.');
      }
    } catch {
      /* user can type */
    } finally {
      setIsScanning(false);
    }
  };

  const validateStep2 = (v: AddDriverFormValues): string | null => {
    if (!v.firstName) return 'First Name is required';
    if (!v.lastName) return 'Last Name is required';
    if (!v.middleName) return 'Middle Name 1 is required';
    if (!v.email) return 'Email is required';
    if (!v.nationality) return 'Nationality is required';
    if (!v.dob) return 'Date of Birth is required';
    if (!v.licenseNumber || !v.licenseExpiry) return 'License Number and Expiry Date are required';
    if (!v.licenseClass) return 'License Class is required';
    if (!v.licenseToDrive) return 'License to Drive is required';
    if (!v.sex) return 'Sex is required';
    if (!v.collectorate) return 'Collectorate is required';
    if (!v.controlNumber) return 'Control Number is required';
    return null;
  };

  const onCreate = async (v: AddDriverFormValues) => {
    if (!v.address) {
      toast.error('Address is required');
      return;
    }
    if (!v.proofType || !proofFile) {
      toast.error('Proof of Address is required');
      return;
    }
    setIsLoading(true);
    try {
      let licenseFrontUrl = '';
      let licenseBackUrl = '';
      let proofUrl = '';
      const uploads: Promise<void>[] = [];
      if (licenseFront) {
        uploads.push(api.uploadFile(licenseFront).then((res) => { licenseFrontUrl = res.url; }));
      }
      if (licenseBack) {
        uploads.push(api.uploadFile(licenseBack).then((res) => { licenseBackUrl = res.url; }));
      }
      uploads.push(api.uploadFile(proofFile).then((res) => { proofUrl = res.url; }));
      await Promise.all(uploads);

      const fullName = `${v.firstName} ${v.middleName ? v.middleName + ' ' : ''}${v.lastName}`.trim();
      const fullPhone = v.phoneNumber ? `${v.countryCode} ${v.phoneNumber}` : '';
      const res = await api.saveDriver({
        name: fullName,
        phone: fullPhone,
        email: v.email || '',
        status: v.status,
        address: v.address,
        licenseFrontUrl,
        licenseBackUrl,
        licenseUrl: licenseFrontUrl,
        proofOfAddressUrl: proofUrl,
        proofOfAddressType: v.proofType,
        addressDocUrl: proofUrl,
        licenseNumber: v.licenseNumber,
        licenseExpiry: v.licenseExpiry,
        dob: v.dob,
        licenseClass: v.licenseClass,
        licenseToDrive: v.licenseToDrive,
        controlNumber: v.controlNumber,
        nationality: v.nationality,
        originalIssueDate: v.originalIssueDate,
        vehicle: 'Unassigned',
        totalTrips: 0,
        totalEarnings: 0,
        todaysEarnings: 0,
        todaysTrips: 0,
        acceptanceRate: 100,
        tier: 'Bronze',
        avatarUrl: '',
      });
      if (res.error) throw new Error(res.error);
      onDriverAdded(res.data);
      toast.success('Driver account created successfully');
      handleClose(true);
    } catch (error) {
      toast.error('Failed to create profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = (clearDraft = false) => {
    if (clearDraft) clearAddDriverDraft();
    reset(defaultAddDriverValues);
    setLicenseFront(null);
    setLicenseBack(null);
    setProofFile(null);
    setStep(1);
    setLicenseStep('front-upload');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => handleClose(false)}>
      <DialogContent className="sm:max-w-[600px] overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Driver Profile</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Start by scanning the driver's license."
              : 'Verify details and complete onboarding.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4 mt-2">
          <div className={cn('h-2 rounded-full flex-1 transition-all', step >= 1 ? 'bg-slate-900' : 'bg-slate-100')} />
          <div className={cn('h-2 rounded-full flex-1 transition-all', step >= 2 ? 'bg-slate-900' : 'bg-slate-100')} />
          <div className={cn('h-2 rounded-full flex-1 transition-all', step >= 3 ? 'bg-slate-900' : 'bg-slate-100')} />
        </div>
        <div className="flex justify-between text-xs font-medium text-slate-500 mb-6 uppercase tracking-wider">
          <span className={cn(step === 1 && 'text-slate-900')}>License</span>
          <span className={cn(step === 2 && 'text-slate-900')}>Details</span>
          <span className={cn(step === 3 && 'text-slate-900')}>Proof of Address</span>
        </div>

        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onCreate)}>
            {step === 1 && (
              <AddDriverLicenseStep
                licenseStep={licenseStep}
                licenseFront={licenseFront}
                licenseBack={licenseBack}
                onLicenseFront={setLicenseFront}
                onLicenseBack={setLicenseBack}
                matchedDriver={matchedDriver}
              />
            )}
            {(step === 2 || step === 3) && (
              <AddDriverDetailsStep
                step={step}
                proofFile={proofFile}
                onProofFile={setProofFile}
                isScanning={isScanning}
                onScanAddress={handleScanAddress}
                matchedDriver={matchedDriver}
              />
            )}

            <DialogFooter className="mt-8 flex justify-between sm:justify-between items-center w-full">
              <AddDriverModalFooter
                step={step}
                licenseStep={licenseStep}
                isScanning={isScanning}
                isLoading={isLoading}
                hasFront={!!licenseFront}
                hasBack={!!licenseBack}
                onClose={() => handleClose(false)}
                onScanFront={handleScanFront}
                onScanBack={handleScanBack}
                setLicenseStep={setLicenseStep}
                setStep={setStep}
                onConfirmDetails={() => {
                  const err = validateStep2(getValues());
                  if (err) {
                    toast.error(err);
                    return;
                  }
                  setStep(3);
                }}
              />
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
