import { useCallback, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { getCroppedImage } from '../lib/crop-image';

interface ImageCropModalProps {
  file: File;
  aspect: number;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

export default function ImageCropModal({ file, aspect, onConfirm, onCancel }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const imageUrl = URL.createObjectURL(file);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedArea) return;
    setIsSaving(true);
    try {
      const blob = await getCroppedImage(imageUrl, croppedArea, file.type || 'image/jpeg');
      onConfirm(blob);
    } finally {
      setIsSaving(false);
      URL.revokeObjectURL(imageUrl);
    }
  };

  const handleCancel = () => {
    URL.revokeObjectURL(imageUrl);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-on-background/90">
      <header className="flex h-14 shrink-0 items-center justify-between px-margin-mobile">
        <button
          type="button"
          onClick={handleCancel}
          className="text-label-md font-semibold text-on-primary-container"
        >
          Cancel
        </button>
        <span className="text-label-md font-semibold text-on-primary-container">Crop Image</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSaving || !croppedArea}
          className="text-label-md font-semibold text-primary-container disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Done'}
        </button>
      </header>

      <div className="relative flex-1">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="flex shrink-0 items-center gap-sm bg-surface px-margin-mobile py-md">
        <MaterialIcon name="zoom_out" className="text-on-surface-variant" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="flex-1 accent-primary-container"
          aria-label="Zoom"
        />
        <MaterialIcon name="zoom_in" className="text-on-surface-variant" />
      </div>
    </div>
  );
}
