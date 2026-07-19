/**
 * Client-side image compression utility.
 * Resizes large images using canvas before upload to stay within Supabase limits.
 */

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB target (under 5MB bucket limit)
const MAX_DIMENSION = 2048; // Max width or height in pixels
const INITIAL_QUALITY = 0.85;
const MIN_QUALITY = 0.5;
const IMAGE_LOAD_TIMEOUT_MS = 10_000;

/** OCR scans: always downscale — phone photos hang Edge Functions when uploaded raw. */
export const OCR_COMPRESS_OPTS = {
  force: true,
  maxDimension: 1600,
  maxFileSize: 1.5 * 1024 * 1024,
} as const;

export type CompressImageOptions = {
  force?: boolean;
  maxDimension?: number;
  maxFileSize?: number;
};

export async function compressImage(file: File, options?: CompressImageOptions): Promise<File> {
  // Only compress image files
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const maxFileSize = options?.maxFileSize ?? MAX_FILE_SIZE;
  const maxDimension = options?.maxDimension ?? MAX_DIMENSION;
  const force = options?.force === true;

  // Skip if already under the limit (unless OCR force-resize)
  if (!force && file.size <= maxFileSize) {
    return file;
  }

  console.log(`[compressImage] Compressing ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      clearTimeout(loadTimeoutId);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const loadTimeoutId = setTimeout(() => {
      fail(new Error('Image compression timed out. Please try a smaller or clearer photo.'));
    }, IMAGE_LOAD_TIMEOUT_MS);

    img.onload = () => {
      if (settled) return;
      clearTimeout(loadTimeoutId);
      URL.revokeObjectURL(url);

      // Calculate scaled dimensions
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        settled = true;
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
              settled = true;
              reject(new Error('Canvas compression failed'));
              return;
            }

            if (blob.size > maxFileSize && quality > MIN_QUALITY) {
              quality -= 0.1;
              console.log(`[compressImage] Still ${(blob.size / 1024 / 1024).toFixed(2)}MB, retrying at quality ${quality.toFixed(1)}`);
              tryCompress();
              return;
            }

            const compressedFile = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
              type: outputType === 'image/png' ? 'image/png' : 'image/jpeg',
              lastModified: file.lastModified,
            });

            console.log(`[compressImage] Compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
            settled = true;
            resolve(compressedFile);
          },
          outputType === 'image/png' ? 'image/png' : 'image/jpeg',
          outputType === 'image/png' ? undefined : quality
        );
      };

      tryCompress();
    };

    img.onerror = () => {
      // OCR paths must not fall back to the raw huge file (hangs uploads/OCR)
      if (force) {
        fail(new Error('Could not process this photo. Please retake and try again.'));
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      console.warn('[compressImage] Could not load image for compression, returning original');
      resolve(file);
    };

    img.src = url;
  });
}
