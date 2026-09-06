import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Sparkles, ScanLine, ShieldCheck, AlertTriangle } from 'lucide-react';
import { AddDriverFileUpload } from './AddDriverFileUpload';
import type { AddDriverFormValues, LicenseSubStep } from './addDriverForm';

type Props = {
  licenseStep: LicenseSubStep;
  licenseFront: File | null;
  licenseBack: File | null;
  onLicenseFront: (f: File) => void;
  onLicenseBack: (f: File) => void;
  matchedDriver: { name?: string } | null;
};

export function AddDriverLicenseStep({
  licenseStep,
  licenseFront,
  licenseBack,
  onLicenseFront,
  onLicenseBack,
  matchedDriver,
}: Props) {
  const { register, control } = useFormContext<AddDriverFormValues>();
  const isReview = licenseStep === 'front-review' || licenseStep === 'back-review';

  if (!isReview) {
    return (
      <div className="space-y-6 py-2 animate-in fade-in slide-in-from-left-4 duration-300">
        <div>
          <Label className="block mb-3 font-medium text-slate-900">
            Upload Driver&apos;s License <span className="text-red-500">*</span>
          </Label>
          {licenseStep === 'front-upload' ? (
            <div className="space-y-2">
              <AddDriverFileUpload
                label="Front"
                file={licenseFront}
                onFileSelect={onLicenseFront}
                icon={ScanLine}
                required
              />
              <p className="text-xs text-slate-500 mt-2">
                Upload the front of the license to auto-fill personal details.
              </p>
            </div>
          ) : (
            <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <AddDriverFileUpload
                label="Back"
                file={licenseBack}
                onFileSelect={onLicenseBack}
                icon={ShieldCheck}
                required
              />
              <p className="text-xs text-slate-500 mt-2">
                Upload the back of the license for verification.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-2 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-emerald-50 p-3 rounded border border-emerald-100 mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-600" />
        <span className="text-xs text-emerald-800 font-medium">
          {licenseStep === 'front-review'
            ? 'Details extracted from front of license. Please review before proceeding.'
            : 'Details extracted from back of license. Please review before proceeding.'}
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

      {licenseStep === 'front-review' ? (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3 border-b pb-1">Identity Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name <span className="text-red-500">*</span></Label>
              <Input {...register('firstName')} />
            </div>
            <div className="space-y-2">
              <Label>Last Name <span className="text-red-500">*</span></Label>
              <Input {...register('lastName')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Middle Name 1 <span className="text-red-500">*</span></Label>
              <Input {...register('middleName')} />
            </div>
            <div className="space-y-2">
              <Label>Middle Name 2</Label>
              <Input {...register('middleName2')} placeholder="Optional" />
            </div>
          </div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3 border-b pb-1 mt-4">
            License Information
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>TRN / License No. <span className="text-red-500">*</span></Label>
              <Input {...register('licenseNumber')} placeholder="e.g. 123456789" />
            </div>
            <div className="space-y-2">
              <Label>Class <span className="text-red-500">*</span></Label>
              <Input {...register('licenseClass')} placeholder="e.g. CLASS C" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date of Birth <span className="text-red-500">*</span></Label>
              <Input type="date" {...register('dob')} />
            </div>
            <div className="space-y-2">
              <Label>Expiry Date <span className="text-red-500">*</span></Label>
              <Input type="date" {...register('licenseExpiry')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sex <span className="text-red-500">*</span></Label>
              <Controller
                name="sex"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Male</SelectItem>
                      <SelectItem value="F">Female</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Collectorate <span className="text-red-500">*</span></Label>
              <Input {...register('collectorate')} placeholder="e.g. Spanish Town" />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3 border-b pb-1">
            Additional License Details
          </h4>
          <div className="space-y-2">
            <Label>License to Drive</Label>
            <Input {...register('licenseToDrive')} />
          </div>
          <div className="space-y-2">
            <Label>Original Date of Issue</Label>
            <Input type="date" {...register('originalIssueDate')} />
          </div>
          <div className="space-y-2">
            <Label>Control No.</Label>
            <Input {...register('controlNumber')} />
          </div>
          <div className="space-y-2">
            <Label>Nationality</Label>
            <Input {...register('nationality')} />
          </div>
        </div>
      )}
    </div>
  );
}
