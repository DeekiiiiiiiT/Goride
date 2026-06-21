import { useRef, useState } from 'react';
import { MaterialIcon } from './MaterialIcon';

interface UploadAreaProps {
  icon: string;
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  minHeight?: string;
}

export default function UploadArea({
  icon,
  label,
  hint,
  accept,
  file,
  onChange,
  minHeight = 'min-h-[140px]',
}: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (selected: File | null) => {
    onChange(selected);
  };

  return (
    <div
      className={`partner-upload-area relative flex ${minHeight} cursor-pointer flex-col items-center justify-center rounded-lg p-md text-center ${isDragging ? 'dragover' : ''}`}
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
        if (dropped) handleFile(dropped);
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <MaterialIcon name={icon} className="mb-2 text-outline" size={file ? 28 : 36} />
      <span
        className={`mb-1 text-label-md font-semibold ${file ? 'text-secondary' : 'text-primary'}`}
      >
        {file ? file.name : label}
      </span>
      {!file && <span className="text-label-sm text-on-surface-variant">{hint}</span>}
    </div>
  );
}
