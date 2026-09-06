import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Loader2,
  Sparkles,
  FileText,
  Globe,
  CreditCard,
  Car,
  Hash,
  AlertTriangle,
} from 'lucide-react';
import { AddDriverFileUpload } from './AddDriverFileUpload';
import { COUNTRY_CODES, type AddDriverFormValues } from './addDriverForm';

type Props = {
  step: 2 | 3;
  proofFile: File | null;
  onProofFile: (f: File) => void;
  isScanning: boolean;
  onScanAddress: () => void;
  matchedDriver: { name?: string } | null;
};

export function AddDriverDetailsStep({
  step,
  proofFile,
  onProofFile,
  isScanning,
  onScanAddress,
  matchedDriver,
}: Props) {
  const { register, control, watch } = useFormContext<AddDriverFormValues>();
  const address = watch('address');

  if (step === 3) {
    return (
      <div className="space-y-6 py-2 animate-in fade-in slide-in-from-right-4 duration-300">
        <div>
          <Label className="block mb-3 font-medium text-slate-900">
            Proof of Address <span className="text-red-500">*</span>
          </Label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium uppercase text-slate-500 mb-2 block">
                Document Type
              </Label>
              <Controller
                name="proofType"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="electric">Electric/Light Bill</SelectItem>
                      <SelectItem value="water">Water Bill</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <AddDriverFileUpload
              label="Bill Document"
              file={proofFile}
              onFileSelect={onProofFile}
              icon={FileText}
              required
            />
          </div>
          {proofFile && !address && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onScanAddress}
              disabled={isScanning}
              className="mt-2 w-full"
            >
              {isScanning ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-3 w-3 text-amber-500" />
              )}
              Auto-fill Address from Document
            </Button>
          )}
        </div>
        <div className="grid grid-cols-4 items-start gap-4">
          <Label className="text-right pt-2.5">
            Address <span className="text-red-500">*</span>
          </Label>
          <div className="col-span-3">
            <Input placeholder="Street Address, City, Zip" {...register('address')} />
            <p className="text-xs text-slate-500 mt-1">Where the fleet vehicle will be kept.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-2 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-emerald-50 p-3 rounded border border-emerald-100 mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-600" />
        <span className="text-xs text-emerald-800 font-medium">
          Details verified. Please confirm to finish.
        </span>
      </div>

      {matchedDriver && (
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 mb-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-900">Identity Match Detected</h4>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              A driver named <span className="font-bold underline">{matchedDriver.name}</span> already
              exists. Submitting will update the existing profile instead of creating a duplicate.
            </p>
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-3 border-b pb-1">Personal Information</h4>
        <div className="space-y-4">
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2.5">
              Name <span className="text-red-500">*</span>
            </Label>
            <div className="col-span-3 space-y-3">
              <div className="flex gap-3">
                <Input placeholder="First Name" {...register('firstName')} className="flex-1" />
                <Input placeholder="Middle 1" {...register('middleName')} className="w-[100px]" />
                <Input placeholder="Middle 2" {...register('middleName2')} className="w-[100px]" />
              </div>
              <Input placeholder="Last Name" {...register('lastName')} />
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              DOB <span className="text-red-500">*</span>
            </Label>
            <div className="col-span-3 flex gap-4">
              <Input type="date" {...register('dob')} className="flex-1" />
              <div className="flex items-center gap-2 w-[140px]">
                <Label className="text-xs whitespace-nowrap">Sex</Label>
                <Controller
                  name="sex"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">M</SelectItem>
                        <SelectItem value="F">F</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Phone</Label>
            <div className="col-span-3 flex gap-3">
              <Controller
                name="countryCode"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-[110px]">
                      <SelectValue placeholder="Code" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Input placeholder="555-0123" {...register('phoneNumber')} className="flex-1" />
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              className="col-span-3"
              placeholder="driver@example.com"
            />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2 text-slate-500">Login</Label>
            <p className="col-span-3 text-xs text-slate-500 leading-relaxed">
              Driver app access is issued via{' '}
              <span className="font-medium text-slate-700">Invite driver</span> on the Drivers page —
              no password is set here.
            </p>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              Nationality <span className="text-red-500">*</span>
            </Label>
            <div className="col-span-3 relative">
              <Globe className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input {...register('nationality')} placeholder="e.g. Jamaican" className="pl-9" />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-3 border-b pb-1 mt-2">License Details</h4>
        <div className="space-y-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              TRN / Lic # <span className="text-red-500">*</span>
            </Label>
            <div className="col-span-3 relative">
              <CreditCard className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input {...register('licenseNumber')} className="pl-9" placeholder="123456789" />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Collectorate</Label>
            <div className="col-span-3">
              <Input {...register('collectorate')} placeholder="e.g. Spanish Town" />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              Expires <span className="text-red-500">*</span>
            </Label>
            <div className="col-span-3">
              <Input type="date" {...register('licenseExpiry')} />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Issued</Label>
            <div className="col-span-3">
              <Input type="date" {...register('originalIssueDate')} />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              Class <span className="text-red-500">*</span>
            </Label>
            <div className="col-span-3">
              <Input {...register('licenseClass')} placeholder="e.g. Class C" />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              Licence to Drive <span className="text-red-500">*</span>
            </Label>
            <div className="col-span-3 relative">
              <Car className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                {...register('licenseToDrive')}
                placeholder="e.g. Motor Car, Motorcycle"
                className="pl-9"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              Control No. <span className="text-red-500">*</span>
            </Label>
            <div className="col-span-3 relative">
              <Hash className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input {...register('controlNumber')} placeholder="Enter Control Number" className="pl-9" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
