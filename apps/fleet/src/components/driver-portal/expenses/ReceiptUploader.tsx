// cache-bust: force recompile — 2026-02-10
import React, { useRef } from 'react';
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Camera, Upload, X, Loader2, FileText } from "lucide-react";

interface ReceiptUploaderProps {
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  previewUrl: string | null;
  isScanning: boolean;
  fileName?: string;
}

export function ReceiptUploader({ 
  onFileSelect, 
  onClear, 
  previewUrl, 
  isScanning,
  fileName 
}: ReceiptUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <Label>Receipt</Label>
      
      {!previewUrl ? (
        <div 
          onClick={handleClick}
          className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors gap-2"
        >
          <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center">
            <Camera className="h-5 w-5 text-slate-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-900">Take a photo of receipt</p>
            <p className="text-xs text-slate-500">or upload from gallery</p>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*,application/pdf"
            capture="environment"
            onChange={onFileSelect}
          />
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