import { useRef, useState } from 'react';
import { MaterialIcon } from './MaterialIcon';
import type { UploadedDocumentRef } from '../types';

interface UploadAreaProps {
  icon: string;
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  minHeight?: string;
  uploadedDoc?: UploadedDocumentRef | null;
  onUpload?: (file: File) => Promise<UploadedDocumentRef>;
}

export default function UploadArea({
  icon,
  label,
  hint,
  accept,
  file,
  onChange,
  minHeight = 'min-h-[140px]',
  uploadedDoc,
  onUpload,
}: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (selected: File | null) => {
    setError(null);
    if (!selected) {
      onChange(null);
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError('File must be 10MB or smaller');
      return;
    }

    onChange(selected);

    if (onUpload) {
      setUploading(true);
      try {
        await onUpload(selected);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        onChange(null);
      } finally {
        setUploading(false);
      }
    }
  };

  const displayName = uploadedDoc?.fileName || file?.name;
  const isComplete = uploadedDoc?.status === 'approved' || uploadedDoc?.status === 'pending';

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`partner-upload-area relative flex ${minHeight} cursor-pointer flex-col items-center justify-center rounded-lg p-inset-md text-center ${isDragging ? 'dragover' : ''} ${uploading ? 'opacity-70' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) void handleFile(dropped);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!uploading) inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="pointer-events-none flex flex-col items-center justify-center">
          {uploading ? (
            <MaterialIcon name="progress_activity" className="mb-2 animate-spin text-primary" size={32} />
          ) : (
            <MaterialIcon
              name={isComplete ? 'check_circle' : icon}
              filled={isComplete}
              className={`mb-2 ${isComplete ? 'text-primary' : 'text-outline'}`}
              size={displayName ? 28 : 36}
            />
          )}
          <span
            className={`mb-1 text-label-md font-semibold ${displayName ? 'text-secondary' : 'text-primary'}`}
          >
            {uploading ? 'Uploading…' : displayName || label}
          </span>
          {!displayName && !uploading && (
            <span className="text-label-sm text-on-surface-variant">{hint}</span>
          )}
          {uploadedDoc && (
            <span className="mt-1 text-label-sm capitalize text-on-surface-variant">
              Status: {uploadedDoc.status}
            </span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          aria-label={label}
          className="absolute inset-0 z-[1] h-full w-full cursor-pointer opacity-0"
          disabled={uploading}
          onChange={(e) => {
            void handleFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-label-sm text-error">{error}</p>}
    </div>
  );
}
