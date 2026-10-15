// cache-bust: force recompile — 2026-02-10
import React, { useEffect } from 'react';
import { Button } from '@roam/ui';
import { Label } from '@roam/ui';
import { Camera, Upload, X, Loader2, FileText } from "lucide-react";
import {
  captureNativePhoto,
  clearCameraDraft,
  consumeRestoredPhoto,
  pickGalleryFile,
  registerCaptureHandler,
  saveCameraDraft,
} from '../../../utils/nativePhotoCapture';
import { toast } from 'sonner';

interface ReceiptUploaderProps {
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  previewUrl: string | null;
  isScanning: boolean;
  fileName?: string;
  label?: string;
  hint?: string;
  /** Persisted with camera draft so boot resume can reopen the right expense step. */
  draftExtras?: Record<string, unknown>;
}

function asFileChangeEvent(file: File): React.ChangeEvent<HTMLInputElement> {
  const dt = new DataTransfer();
  dt.items.add(file);
  return { target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>;
}

export function ReceiptUploader({ 
  onFileSelect, 
  onClear, 
  previewUrl, 
  isScanning,
  fileName,
  label = 'Receipt',
  hint = 'or upload from gallery',
  draftExtras,
}: ReceiptUploaderProps) {
  const deliver = (file: File) => {
    clearCameraDraft('receipt');
    onFileSelect(asFileChangeEvent(file));
  };

  useEffect(() => {
    const unsub = registerCaptureHandler('receipt', (file) => {
      toast.message('We saved your draft after the camera closed.');
      deliver(file);
    });
    void consumeRestoredPhoto('receipt').then((file) => {
      if (file) {
        toast.message('We saved your draft after the camera closed.');
        deliver(file);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCamera = async () => {
    saveCameraDraft('receipt', { label, ...draftExtras });
    const file = await captureNativePhoto('receipt');
    if (file) deliver(file);
  };

  const handleGallery = async () => {
    const file = await pickGalleryFile('image/*,application/pdf');
    if (file) deliver(file);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      
      {!previewUrl ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void handleCamera()}
            className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-90"
          >
            <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center">
              <Camera className="h-5 w-5 text-slate-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-900">Take a photo of {label.toLowerCase().includes('pump') ? 'the pump' : 'receipt'}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => void handleGallery()}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <Upload className="h-3 w-3" />
            {hint}
          </button>
        </div>
      ) : (
        <div className="relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
          <div className="p-3 flex items-center gap-3">
             <div className="h-10 w-10 rounded bg-white border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                {previewUrl.startsWith('data:image') ? (
                  <img src={previewUrl} alt="Receipt" className="h-full w-full object-cover" />
                ) : (
                  <FileText className="h-5 w-5 text-slate-400" />
                )}
             </div>
             <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {fileName || "Receipt captured"}
                </p>
                {isScanning ? (
                   <p className="text-xs text-blue-600 flex items-center">
                     <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Scanning details...
                   </p>
                ) : (
                   <p className="text-xs text-green-600 flex items-center">
                     Details extracted
                   </p>
                )}
             </div>
             <Button 
               type="button" 
               variant="ghost" 
               size="icon" 
               className="h-8 w-8 text-slate-500 hover:text-red-500"
               onClick={onClear}
             >
               <X className="h-4 w-4" />
             </Button>
          </div>
        </div>
      )}
    </div>
  );
}
