/**
 * Client-side image compression utility.
 * Resizes large images using canvas before upload to stay within Supabase Storage limits.
 */

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB target (under 5MB bucket limit)
const MAX_DIMENSION = 2048; // Max width or height in pixels
const INITIAL_QUALITY = 0.85;
const MIN_QUALITY = 0.5;

export async function compressImage(file: File): Promise<File> {
  // Only compress image files
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Skip if already under the limit
  if (file.size <= MAX_FILE_SIZE) {
    return file;
  }

  console.log(`[compressImage] Compressing ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate scaled dimensions
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Iteratively reduce quality until under the size limit
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      let quality = INITIAL_QUALITY;

      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas compression failed'));
              return;
            }

            if (blob.size > MAX_FILE_SIZE && quality > MIN_QUALITY) {
              quality -= 0.1;
              console.log(`[compressImage] Still ${(blob.size / 1024 / 1024).toFixed(2)}MB, retrying at quality ${quality.toFixed(1)}`);
              tryCompress();
              return;
            }

            const compressedFile = new File([blob], file.name, {
              type: outputType,
              lastModified: file.lastModified,
            });

            console.log(`[compressImage] Compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
            resolve(compressedFile);
          },
          outputType,
          outputType === 'image/jpeg' ? quality : undefined
        );
      };

      tryCompress();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // If we can't load as image, return original
      console.warn('[compressImage] Could not load image for compression, returning original');
      resolve(file);
    };

    img.src = url;
  });
}
