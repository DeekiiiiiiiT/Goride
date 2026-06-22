import { SignUpFormData, UploadedDocumentRef } from '../../signup/types';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import UploadArea from '../../signup/components/UploadArea';
import { uploadMerchantDocument } from '../../lib/partner-api';
import type { MerchantDocumentType } from '@roam/types';
import { SectionCard, SectionHeader } from './OnboardingShell';

interface VerificationStepContentProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
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

export default function VerificationStepContent({
  data,
  onChange,
  enableUpload = false,
}: VerificationStepContentProps) {
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
    <SectionCard className="md:p-inset-lg">
      <SectionHeader
        icon="verified_user"
        title="Verify your identity"
        subtitle="To maintain a secure platform, we need to verify the business owner's details."
      />
      <hr className="border-outline-variant/50" />
      <div className="flex flex-col gap-inset-lg">
        <div>
          <label className="mb-inset-xs block text-label-md font-semibold text-on-surface" htmlFor="ownerName">
            Owner full name <span className="text-error">*</span>
          </label>
          <input
            id="ownerName"
            type="text"
            className="h-12 w-full rounded-lg border border-outline-variant bg-transparent px-4 text-body-lg text-on-surface partner-field"
            placeholder="e.g. Jane Doe"
            value={data.ownerFullName}
            onChange={(e) => onChange({ ownerFullName: e.target.value })}
          />
        </div>

        <div className="border-t border-outline-variant pt-inset-lg">
          <h2 className="mb-inset-md text-headline-md font-semibold text-on-surface">Document upload</h2>
          <div className="mb-inset-lg space-y-inset-sm">
            <label className="block text-label-md font-semibold text-on-surface">Government ID</label>
            <p className="mb-inset-xs text-body-sm text-on-surface-variant">
              Upload clear photos of the front and back of your valid government-issued ID.
            </p>
            <div className="grid grid-cols-1 gap-inset-sm md:grid-cols-2">
              <UploadArea
                icon="badge"
                label="Upload ID front"
                hint="JPEG, PNG up to 10MB"
                accept="image/*"
                file={data.idFrontFile}
                onChange={(file) => onChange({ idFrontFile: file })}
                uploadedDoc={data.idFrontDoc}
                onUpload={makeUploader('id_front', 'idFrontDoc', 'idFrontFile')}
              />
              <UploadArea
                icon="id_card"
                label="Upload ID back"
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
            <label className="block text-label-md font-semibold text-on-surface">Proof of business</label>
            <p className="mb-inset-xs text-body-sm text-on-surface-variant">
              Business license, utility bill (last 3 months), or commercial lease agreement.
            </p>
            <UploadArea
              icon="description"
              label="Upload business document"
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

        <div className="flex items-center justify-center gap-inset-xs text-on-surface-variant">
          <MaterialIcon name="info" size={18} />
          <span className="text-label-sm">Verification takes 1–2 business days.</span>
        </div>
      </div>
    </SectionCard>
  );
}
