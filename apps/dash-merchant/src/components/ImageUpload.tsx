import React, { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { supabase } from '@roam/auth-client';

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  bucket?: string;
  folder?: string;
  aspectRatio?: 'square' | 'cover' | 'logo';
  label?: string;
  placeholder?: string;
}

export default function ImageUpload({
  value,
  onChange,
  bucket = 'merchant-assets',
  folder = 'images',
  aspectRatio = 'square',
  label,
  placeholder = 'Click or drag to upload',
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const aspectClasses = {
    square: 'aspect-square',
    cover: 'aspect-[16/9]',
    logo: 'aspect-square max-w-[150px]',
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      onChange(publicUrl);
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.message || 'Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative cursor-pointer rounded-xl border-2 border-dashed transition-colors overflow-hidden
          ${aspectClasses[aspectRatio]}
          ${dragActive ? 'border-amber-500 bg-amber-50' : 'border-gray-300 hover:border-amber-400'}
          ${value ? 'border-solid border-gray-200' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
        />

        {isUploading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            <span className="text-sm text-gray-500 mt-2">Uploading...</span>
          </div>
        ) : value ? (
          <>
            <img
              src={value}
              alt="Uploaded"
              className="w-full h-full object-cover"
            />
            <button
              onClick={handleRemove}
              className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <Upload className="w-8 h-8 mb-2" />
            <span className="text-sm">{placeholder}</span>
            <span className="text-xs mt-1">PNG, JPG up to 5MB</span>
          </div>
        )}
      </div>
    </div>
  );
}
