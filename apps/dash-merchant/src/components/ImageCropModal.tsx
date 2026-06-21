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

  const aspectLabel = aspect === 1 ? '1:1' : '16:9';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-margin-mobile">
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-outline-variant p-md">
          <h3 className="text-headline-md font-semibold text-on-surface">Crop Image</h3>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            aria-label="Close"
          >
            <MaterialIcon name="close" />
          </button>
        </header>

        <div className="relative flex h-[min(350px,50dvh)] flex-col bg-surface-container-low">
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
          <div className="flex shrink-0 items-center gap-sm border-t border-outline-variant/50 px-md py-sm">
            <MaterialIcon name="zoom_out" className="text-on-surface-variant" size={20} />
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
            <MaterialIcon name="zoom_in" className="text-on-surface-variant" size={20} />
            <span className="text-label-sm text-on-surface-variant">{aspectLabel}</span>
          </div>
        </div>

        <footer className="flex justify-end gap-sm border-t border-outline-variant bg-surface p-md">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg px-sm py-2 text-label-md font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSaving || !croppedArea}
            className="rounded-lg bg-primary-container px-sm py-2 text-label-md font-semibold text-on-primary shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Use Photo'}
          </button>
        </footer>
      </div>
    </div>
  );
}
