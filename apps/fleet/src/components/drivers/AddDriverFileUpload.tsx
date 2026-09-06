import React, { useRef } from 'react';
import { Label } from '../ui/label';
import { Check, Upload, Camera } from 'lucide-react';
import { cn } from '../ui/utils';

export function AddDriverFileUpload({
  label,
  file,
  onFileSelect,
  accept = 'image/*,.pdf',
  icon: Icon = Upload,
  required = false,
  className,
}: {
  label: string;
  file: File | null;
  onFileSelect: (f: File) => void;
  accept?: string;
  icon?: React.ComponentType<{ className?: string }>;
  required?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const renderHiddenInputs = () => (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelect(f);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelect(f);
          e.target.value = '';
        }}
      />
    </>
  );

  if (file) {
    return (
      <div className={cn('space-y-2', className)}>
        <Label
          className={cn(
            "text-xs font-medium uppercase text-slate-500",
            required && "after:content-['*'] after:ml-0.5 after:text-red-500",
          )}
        >
          {label}
        </Label>
        <div
          className="border-2 border-dashed border-emerald-500 bg-emerald-50/50 rounded-lg p-4 flex flex-col items-center justify-center text-center gap-2 h-40 cursor-pointer transition-colors hover:bg-emerald-100/50"
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label={`Change ${label} file`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          {renderHiddenInputs()}
          <div className="bg-emerald-100 p-2 rounded-full">
            <Check className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="text-sm font-medium text-emerald-900 w-full truncate px-2">{file.name}</div>
          <div className="text-xs text-emerald-600 font-medium">Click to change</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label
        className={cn(
          "text-xs font-medium uppercase text-slate-500",
          required && "after:content-['*'] after:ml-0.5 after:text-red-500",
        )}
      >
        {label}
      </Label>
      {renderHiddenInputs()}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            cameraInputRef.current?.click();
          }}
          className="flex flex-col items-center justify-center gap-2 h-28 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-900 border-dashed rounded-xl transition-all text-slate-700 group shadow-sm hover:shadow-md"
        >
          <div className="bg-slate-50 p-3 rounded-full group-hover:bg-slate-900 group-hover:text-white transition-colors">
            <Camera className="h-6 w-6" />
          </div>
          <span className="text-sm font-semibold">Scan with Camera</span>
        </button>
        <div className="flex items-center gap-3 px-2">
          <div className="h-px bg-slate-200 flex-1" />
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">or</span>
          <div className="h-px bg-slate-200 flex-1" />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            inputRef.current?.click();
          }}
          className="flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
        >
          <Icon className="h-3.5 w-3.5" />
          Upload from Device
        </button>
      </div>
    </div>
  );
}
