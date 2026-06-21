import { useRef, useState } from 'react';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import ImageCropModal from './ImageCropModal';

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  bucket?: string;
  folder?: string;
  aspectRatio?: 'square' | 'cover' | 'logo';
  label?: string;
  placeholder?: string;
  enableCrop?: boolean;
  className?: string;
}

const ASPECT_VALUES = {
  square: 1,
  cover: 16 / 9,
  logo: 1,
} as const;

const VARIANT_CONFIG = {
  logo: {
    boxClass: 'h-[120px] w-[120px]',
    emptyIcon: 'cloud_upload',
    emptyIconClass: 'text-3xl text-primary-container',
    primaryTextClass: 'text-label-sm font-medium text-primary-container',
    showFileHint: true,
    defaultPlaceholder: 'Upload your logo',
  },
  cover: {
    boxClass: 'aspect-video w-full',
    emptyIcon: 'add_photo_alternate',
    emptyIconClass: 'text-3xl text-on-surface-variant',
    primaryTextClass: 'text-body-sm text-on-surface-variant',
    showFileHint: false,
    defaultPlaceholder: 'Upload a cover photo',
  },
  square: {
    boxClass: 'h-[150px] w-[150px]',
    emptyIcon: 'add_a_photo',
    emptyIconClass: 'text-2xl text-on-surface-variant',
    primaryTextClass: 'text-label-sm text-on-surface-variant',
    showFileHint: false,
    defaultPlaceholder: 'Tap to add photo',
  },
} as const;

export default function ImageUpload({
  value,
  onChange,
  bucket = 'merchant-assets',
  folder = 'images',
  aspectRatio = 'square',
  label,
  placeholder,
  enableCrop = true,
  className = '',
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const variant = VARIANT_CONFIG[aspectRatio];
  const displayText = placeholder || variant.defaultPlaceholder;

  const uploadBlob = async (file: File | Blob, originalName: string) => {
    setIsUploading(true);
    setErrorMessage(null);

    try {
      const fileExt = originalName.split('.').pop() || 'jpg';
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

      if (uploadError) {
        if (uploadError.message?.toLowerCase().includes('bucket not found')) {
          throw new Error(
            `Storage bucket "${bucket}" doesn't exist. Please contact support to set up image uploads.`
          );
        }
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(fileName);

      onChange(publicUrl);
      toast.success('Image uploaded');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to upload image';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const validateAndProcess = async (file: File) => {
    setErrorMessage(null);

    if (!file.type.startsWith('image/')) {
      const message = 'Please select an image file';
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      const message = 'Image must be less than 5MB';
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    if (enableCrop) {
      setCropFile(file);
      return;
    }

    await uploadBlob(file, file.name);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) void validateAndProcess(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void validateAndProcess(file);
    e.target.value = '';
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setErrorMessage(null);
  };

  const boxStateClass = (() => {
    if (errorMessage && !value) {
      return 'border-dashed border-error bg-error-container/30';
    }
    if (value) {
      return 'border-2 border-outline bg-surface';
    }
    if (dragActive) {
      return 'border-dashed border-primary-container bg-primary-container/10';
    }
    if (isUploading) {
      return 'border-2 border-outline-variant bg-surface';
    }
    return 'border-dashed border-outline-variant bg-surface hover:bg-surface-container-low';
  })();

  return (
    <div className={className}>
      {cropFile && (
        <ImageCropModal
          file={cropFile}
          aspect={ASPECT_VALUES[aspectRatio]}
          onCancel={() => setCropFile(null)}
          onConfirm={async (blob) => {
            const name = cropFile.name;
            setCropFile(null);
            await uploadBlob(blob, name);
          }}
        />
      )}

      {label && (
        <label className="mb-inset-xs block text-label-md font-semibold text-on-surface">{label}</label>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 transition-colors ${variant.boxClass} ${boxStateClass}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
        />

        {isUploading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80">
            <div className="partner-spinner mb-inset-xs" role="status" aria-label="Uploading" />
            <span className="text-body-sm text-on-surface">Uploading...</span>
          </div>
        )}

        {value && !isUploading ? (
          <>
            <img src={value} alt={label || 'Uploaded'} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-error text-on-error opacity-100 shadow-sm transition-opacity hover:bg-error/90 md:opacity-0 md:group-hover:opacity-100"
              aria-label="Remove image"
            >
              <MaterialIcon name="close" size={20} />
            </button>
          </>
        ) : !isUploading ? (
          <div className="flex flex-col items-center justify-center px-inset-xs text-center">
            {errorMessage ? (
              <>
                <MaterialIcon name="error_outline" className="mb-inset-xs text-3xl text-error" />
                <span className="text-body-sm text-error">Upload failed</span>
              </>
            ) : dragActive ? (
              <>
                <MaterialIcon
                  name="cloud_upload"
                  className="mb-inset-xs text-3xl text-primary-container"
                />
                <span className="text-body-sm font-medium text-primary-container">
                  Drop photo here
                </span>
              </>
            ) : (
              <>
                <MaterialIcon
                  name={variant.emptyIcon}
                  className={`mb-inset-xs ${variant.emptyIconClass}`}
                />
                <span className={`text-center ${variant.primaryTextClass}`}>{displayText}</span>
                {variant.showFileHint && (
                  <span className="mt-1 text-center text-[11px] text-on-surface-variant">
                    PNG, JPG up to 5MB
                  </span>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>

      {errorMessage && !value && (
        <p className="mt-1 text-label-sm text-error">{errorMessage}</p>
      )}
    </div>
  );
}
