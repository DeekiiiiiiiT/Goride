import { SignUpFormData, UploadedDocumentRef } from '../types';
import { MaterialIcon } from '../components/MaterialIcon';
import UploadArea from '../components/UploadArea';
import { uploadMerchantDocument } from '../../lib/partner-api';
import type { MerchantDocumentType } from '@roam/types';

interface VerificationStepProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
  onBack: () => void;
  onContinue: () => void;
  enableUpload?: boolean;
}

function docRefFromUpload(
  docType: MerchantDocumentType,
  file: File,
  document: { id: string; status: string },
): UploadedDocumentRef {
  return {
    id: document.id,
    docType,
    status: document.status as UploadedDocumentRef['status'],
    fileName: file.name,
  };
}

export default function VerificationStep({
  data,
  onChange,
  onBack,
  onContinue,
  enableUpload = false,
}: VerificationStepProps) {
  const hasIdFront = enableUpload ? !!data.idFrontDoc : data.idFrontFile !== null;
  const hasIdBack = enableUpload ? !!data.idBackDoc : data.idBackFile !== null;
  const hasProof = enableUpload ? !!data.proofOfBusinessDoc : data.proofOfBusinessFile !== null;

  const canSubmit =
    data.ownerFullName.trim().length >= 2 && hasIdFront && hasIdBack && hasProof;

  const makeUploader = (
    docType: MerchantDocumentType,
    field: 'idFrontDoc' | 'idBackDoc' | 'proofOfBusinessDoc',
    fileField: 'idFrontFile' | 'idBackFile' | 'proofOfBusinessFile',
  ) => {
    if (!enableUpload) return undefined;
    return async (file: File) => {
      const { document } = await uploadMerchantDocument(docType, file);
      const ref = docRefFromUpload(docType, file, document);
      onChange({ [field]: ref, [fileField]: file });
      return ref;
    };
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background">
      <header className="mx-auto flex h-16 w-full max-w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile shadow-sm md:px-margin-tablet">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex cursor-pointer items-center gap-inset-xs rounded-lg p-2 transition-colors hover:bg-surface-container-low"
        >
          <MaterialIcon name="arrow_back" className="text-primary" />
          <span className="text-label-md font-semibold text-primary">Back</span>
        </button>
        <div className="text-headline-md font-bold text-primary">Roam Dash Merchant</div>
        <div className="w-8" />
      </header>

      <main className="flex flex-grow items-center justify-center p-margin-mobile py-inset-xl md:p-margin-tablet">
        <div className="w-full max-w-2xl rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-[0px_4px_12px_rgba(0,0,0,0.05)] md:p-inset-lg">
          <div className="mb-inset-lg text-center md:text-left">
            <h1 className="mb-inset-xs text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
              Verify your identity
            </h1>
            <p className="text-body-sm text-on-surface-variant">
              To maintain a secure platform, we need to verify the business owner&apos;s details.
            </p>
          </div>

          <form className="space-y-inset-lg" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="mb-inset-xs block text-label-md font-semibold text-on-surface" htmlFor="ownerName">
                Owner Full Name
              </label>
              <input
                id="ownerName"
                type="text"
                required
                className="h-12 w-full rounded-lg border border-outline-variant bg-transparent px-4 text-body-lg text-on-surface transition-colors placeholder:text-outline partner-field"
                placeholder="e.g. Jane Doe"
                value={data.ownerFullName}
                onChange={(e) => onChange({ ownerFullName: e.target.value })}
              />
            </div>

            <div className="border-t border-outline-variant pt-inset-lg">
              <h2 className="mb-inset-md text-headline-md font-semibold text-on-surface">Document Upload</h2>

              <div className="mb-inset-lg space-y-inset-sm">
                <label className="block text-label-md font-semibold text-on-surface">Government ID</label>
                <p className="mb-inset-xs text-body-sm text-on-surface-variant">
                  Please upload clear photos of the front and back of your valid government-issued ID.
                </p>
                <div className="grid grid-cols-1 gap-inset-sm md:grid-cols-2">
                  <UploadArea
                    icon="badge"
                    label="Upload ID Front"
                    hint="JPEG, PNG up to 10MB"
                    accept="image/*"
                    file={data.idFrontFile}
                    onChange={(file) => onChange({ idFrontFile: file })}
                    uploadedDoc={data.idFrontDoc}
                    onUpload={makeUploader('id_front', 'idFrontDoc', 'idFrontFile')}
                  />
                  <UploadArea
                    icon="id_card"
                    label="Upload ID Back"
                    hint="JPEG, PNG up to 10MB"
                    accept="image/*"
                    file={data.idBackFile}
                    onChange={(file) => onChange({ idBackFile: file })}
                    uploadedDoc={data.idBackDoc}
                    onUpload={makeUploader('id_back', 'idBackDoc', 'idBackFile')}
                  />
                </div>
              </div>

              <div className="space-y-inset-sm">
                <label className="block text-label-md font-semibold text-on-surface">Proof of Business</label>
                <p className="mb-inset-xs text-body-sm text-on-surface-variant">
                  Upload one of the following: Business License, Utility Bill (last 3 months), or
                  Commercial Lease Agreement.
                </p>
                <UploadArea
                  icon="description"
                  label="Upload Business Document"
                  hint="PDF, JPEG, PNG up to 10MB"
                  accept=".pdf,image/*"
                  file={data.proofOfBusinessFile}
                  onChange={(file) => onChange({ proofOfBusinessFile: file })}
                  uploadedDoc={data.proofOfBusinessDoc}
                  onUpload={makeUploader('proof_of_business', 'proofOfBusinessDoc', 'proofOfBusinessFile')}
                  minHeight="min-h-[160px]"
                />
              </div>
            </div>

            <div className="mt-inset-lg pt-inset-md">
              <button
                type="button"
                onClick={onContinue}
                disabled={!canSubmit}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary-container text-label-md font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-fixed-dim active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>Continue</span>
                <MaterialIcon name="arrow_forward" filled />
              </button>
              <div className="mt-inset-sm flex items-center justify-center gap-inset-xs text-on-surface-variant">
                <MaterialIcon name="info" size={18} />
                <span className="text-label-sm">Verification takes 1-2 business days.</span>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
