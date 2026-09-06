import { Button } from '../ui/button';
import { Loader2, Check, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import type { LicenseSubStep } from './addDriverForm';

type Props = {
  step: number;
  licenseStep: LicenseSubStep;
  isScanning: boolean;
  isLoading: boolean;
  hasFront: boolean;
  hasBack: boolean;
  onClose: () => void;
  onScanFront: () => void;
  onScanBack: () => void;
  setLicenseStep: (s: LicenseSubStep) => void;
  setStep: (n: number) => void;
  onConfirmDetails: () => void;
};

/** Wizard footer actions — kept separate so AddDriverModal stays ≤400 LOC. */
export function AddDriverModalFooter({
  step,
  licenseStep,
  isScanning,
  isLoading,
  hasFront,
  hasBack,
  onClose,
  onScanFront,
  onScanBack,
  setLicenseStep,
  setStep,
  onConfirmDetails,
}: Props) {
  if (step === 1) {
    return (
      <>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        {licenseStep === 'front-upload' && (
          <Button type="button" onClick={onScanFront} disabled={isScanning || !hasFront} className="bg-slate-900 text-white hover:bg-slate-800 gap-2">
            {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-300" />}
            Scan & Continue
          </Button>
        )}
        {licenseStep === 'front-review' && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setLicenseStep('front-upload')}>Retake</Button>
            <Button type="button" onClick={() => setLicenseStep('back-upload')} className="bg-slate-900 text-white hover:bg-slate-800 gap-2">
              Confirm & Scan Back <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        {licenseStep === 'back-upload' && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setLicenseStep('front-review')}>Back</Button>
            <Button type="button" onClick={onScanBack} disabled={isScanning || !hasBack} className="bg-slate-900 text-white hover:bg-slate-800 gap-2">
              {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-300" />}
              Scan Back & Verify
            </Button>
          </div>
        )}
        {licenseStep === 'back-review' && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setLicenseStep('back-upload')}>Retake Back</Button>
            <Button type="button" onClick={() => setStep(2)} className="bg-slate-900 text-white hover:bg-slate-800 gap-2">
              Confirm & Review All <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        <Button type="button" variant="outline" onClick={() => { setStep(1); setLicenseStep('back-upload'); }}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Button type="button" onClick={onConfirmDetails} className="gap-2">
          Confirm Details <ArrowRight className="h-4 w-4" />
        </Button>
      </>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setStep(2)}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back
      </Button>
      <Button type="submit" disabled={isLoading} className="bg-slate-900 text-white hover:bg-slate-800 gap-2 min-w-[140px]">
        {isLoading ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
        ) : (
          <>Create Profile <Check className="h-4 w-4" /></>
        )}
      </Button>
    </>
  );
}
