import type { MerchantBusinessTypeConfig, MerchantDocumentType } from '@roam/types';
import { getBusinessTypeConfig } from '@roam/vertical-config';
import { SignUpFormData, UploadedDocumentRef } from '../../signup/types';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import UploadArea from '../../signup/components/UploadArea';
import { uploadMerchantDocument } from '../../lib/partner-api';
import { inputClass } from './OnboardingShell';
import { useMerchantBusinessTypes } from '../../hooks/useMerchantBusinessTypes';

interface VerificationStepContentProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
  enableUpload?: boolean;
  typeConfig?: MerchantBusinessTypeConfig | null;
}

const DOC_CONFIG: Record<
  MerchantDocumentType,
  {
    field: keyof SignUpFormData;
    fileField: keyof SignUpFormData;
    icon: string;
    label: string;
    hint: string;
    accept: string;
    regulated?: boolean;
  }
> = {
  id_front: {
    field: 'idFrontDoc',
    fileField: 'idFrontFile',
    icon: 'badge',
    label: 'Front side',
    hint: 'JPEG, PNG up to 10MB',
    accept: 'image/*',
  },
  id_back: {
    field: 'idBackDoc',
    fileField: 'idBackFile',
    icon: 'id_card',
    label: 'Back side',
    hint: 'JPEG, PNG up to 10MB',
    accept: 'image/*',
  },
  proof_of_business: {
    field: 'proofOfBusinessDoc',
    fileField: 'proofOfBusinessFile',
    icon: 'description',
    label: 'Proof of business',
    hint: 'Utility bill or lease — PDF, JPEG, PNG',
    accept: '.pdf,image/*',
  },
  liquor_license: {
    field: 'liquorLicenseDoc',
    fileField: 'liquorLicenseFile',
    icon: 'liquor',
    label: 'Liquor license',
    hint: 'PDF, JPEG, PNG up to 10MB',
    accept: '.pdf,image/*',
    regulated: true,
  },
  pharmacy_permit: {
    field: 'pharmacyPermitDoc',
    fileField: 'pharmacyPermitFile',
    icon: 'clinical_notes',
    label: 'Pharmaceutical Retail License',
    hint: 'Required for pharmacy partners',
    accept: '.pdf,image/*',
    regulated: true,
  },
};

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
  typeConfig: typeConfigProp,
}: VerificationStepContentProps) {
  const { sections } = useMerchantBusinessTypes();
  const typeConfig = typeConfigProp ?? getBusinessTypeConfig(sections, data.businessType);
  const requiredDocs = typeConfig?.required_document_types ?? [
    'id_front',
    'id_back',
    'proof_of_business',
  ];

  const makeUploader = (docType: MerchantDocumentType) => {
    if (!enableUpload) return undefined;
    const cfg = DOC_CONFIG[docType];
    return async (file: File) => {
      const { document } = await uploadMerchantDocument(docType, file);
      const ref = docRefFromUpload(docType, file, document);
      onChange({ [cfg.field]: ref, [cfg.fileField]: file });
      return ref;
    };
  };

  const idDocs = requiredDocs.filter((d) => d === 'id_front' || d === 'id_back');
  const standardDocs = requiredDocs.filter(
    (d) => d !== 'id_front' && d !== 'id_back' && !DOC_CONFIG[d]?.regulated,
  );
  const regulatedDocs = requiredDocs.filter((d) => DOC_CONFIG[d]?.regulated);

  const ownerComplete = data.ownerFullName.trim().length > 0;

  return (
    <section className="space-y-8">
      <div className="md:hidden">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-title-md font-semibold text-on-surface">Verify & Compliance</h2>
          <span className="text-label-md text-on-surface-variant">Step 5/6</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
          <div className="h-full w-5/6 rounded-full bg-primary" />
        </div>
      </div>

      <header>
        <h3 className="text-headline-md font-semibold text-on-background">Verification details</h3>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Please upload the following documents to comply with local regulations and secure your account.
        </p>
      </header>

      <div>
        <label className="mb-2 block px-1 text-label-md text-on-surface-variant" htmlFor="ownerName">
          Owner full name*
        </label>
        <div className="relative">
          <input
            id="ownerName"
            type="text"
            className={`${inputClass} h-14 text-body-lg`}
            placeholder="Enter name as it appears on ID"
            value={data.ownerFullName}
            onChange={(e) => onChange({ ownerFullName: e.target.value })}
          />
          {ownerComplete && (
            <MaterialIcon
              name="check_circle"
              filled
              className="absolute right-4 top-1/2 -translate-y-1/2 text-primary"
            />
          )}
        </div>
      </div>

      {idDocs.length > 0 && (
        <div className="space-y-4">
          <label className="px-1 text-label-md uppercase tracking-wider text-on-surface-variant">
            Government ID upload*
          </label>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {idDocs.map((docType) => {
              const cfg = DOC_CONFIG[docType];
              return (
                <UploadArea
                  key={docType}
                  icon={cfg.icon}
                  label={cfg.label}
                  hint={cfg.hint}
                  accept={cfg.accept}
                  file={data[cfg.fileField] as File | null}
                  onChange={(file) => onChange({ [cfg.fileField]: file })}
                  uploadedDoc={data[cfg.field] as UploadedDocumentRef | null}
                  onUpload={makeUploader(docType)}
                  minHeight="min-h-[12rem]"
                />
              );
            })}
          </div>
        </div>
      )}

      {standardDocs.map((docType) => {
        const cfg = DOC_CONFIG[docType];
        return (
          <div key={docType} className="space-y-2">
            <label className="px-1 text-label-md uppercase tracking-wider text-on-surface-variant">
              Proof of business (Utility bill / Lease)
            </label>
            <UploadArea
              icon={cfg.icon}
              label={cfg.label}
              hint={cfg.hint}
              accept={cfg.accept}
              file={data[cfg.fileField] as File | null}
              onChange={(file) => onChange({ [cfg.fileField]: file })}
              uploadedDoc={data[cfg.field] as UploadedDocumentRef | null}
              onUpload={makeUploader(docType)}
              minHeight="min-h-[140px]"
            />
          </div>
        );
      })}

      {regulatedDocs.map((docType) => {
        const cfg = DOC_CONFIG[docType];
        return (
          <div
            key={docType}
            className="space-y-4 rounded-r-xl border-l-4 border-primary bg-surface-container-low py-2 pl-4"
          >
            <div className="flex items-start justify-between pr-4">
              <div>
                <label className="text-title-md text-on-surface">
                  {cfg.label}
                  <span className="ml-1 text-error">*</span>
                </label>
                <p className="text-label-md text-on-surface-variant">{cfg.hint}</p>
              </div>
              <span className="rounded bg-primary px-2 py-1 text-[10px] font-bold uppercase text-on-primary">
                New
              </span>
            </div>
            <UploadArea
              icon={cfg.icon}
              label={cfg.label}
              hint="PDF or image up to 10MB"
              accept={cfg.accept}
              file={data[cfg.fileField] as File | null}
              onChange={(file) => onChange({ [cfg.fileField]: file })}
              uploadedDoc={data[cfg.field] as UploadedDocumentRef | null}
              onUpload={makeUploader(docType)}
              minHeight="min-h-[120px]"
            />
          </div>
        );
      })}

      <div className="flex flex-col items-center gap-6 rounded-2xl bg-surface-container-low p-6 md:flex-row">
        <div className="flex-1">
          <h4 className="flex items-center gap-2 text-title-md text-on-surface">
            <MaterialIcon name="verified_user" className="text-primary" />
            What&apos;s next?
          </h4>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Verification takes 1–2 business days. You&apos;ll receive an email and a push notification as
            soon as your account is activated.
          </p>
        </div>
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-primary-container/20">
          <MaterialIcon name="verified" filled className="text-4xl text-primary-container" />
        </div>
      </div>
    </section>
  );
}
