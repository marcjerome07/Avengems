import { commerce } from './commerceService';
import { ServiceError } from './serviceError';

/** Mirrors server/src/productImages.js. The server re-checks everything. */
export const IMAGE_RULES = Object.freeze({
  types: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  maxBytes: 5 * 1024 * 1024,
  maxImages: 5,
  maxEdge: 1600,
  quality: 0.92,
});
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

/** Reads the leading bytes so a renamed GIF or PDF is rejected before upload. */
export async function sniffImageType(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte)) return 'image/png';
  const ascii = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Returns a user-facing problem with the file, or '' when it may be uploaded. */
export async function checkImageFile(file) {
  const type = await sniffImageType(file).catch(() => null);
  if (!type) return `${file.name} isn't a JPG, PNG or WebP image.`;
  if (file.size > IMAGE_RULES.maxBytes) return `${file.name} is larger than 5 MB.`;
  return '';
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Downscales to at most 1600px on the long edge. Files already within limits are
 * uploaded untouched so jewelry photos are never re-compressed unnecessarily.
 */
export async function prepareImage(file) {
  const type = await sniffImageType(file);
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, IMAGE_RULES.maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= IMAGE_RULES.maxBytes) return { blob: file, type };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await toBlob(canvas, type, IMAGE_RULES.quality);
    let outputType = blob?.type || type;
    // Very detailed PNGs can stay large; fall back to high-quality WebP.
    if (!blob || blob.size > IMAGE_RULES.maxBytes || !IMAGE_RULES.types[outputType]) {
      blob = await toBlob(canvas, 'image/webp', 0.9);
      outputType = 'image/webp';
    }
    if (!blob || blob.size > IMAGE_RULES.maxBytes || blob.type !== outputType) {
      throw new ServiceError('IMAGE_PREPARE_FAILED', 'This image could not be prepared for upload.');
    }
    return { blob, type: outputType };
  } finally {
    bitmap.close?.();
  }
}

export const requestUploadUrl = (body) => commerce.request('/api/admin/products/images/upload-url', { method: 'POST', body });
export const discardImages = (paths) => (paths.length
  ? commerce.request('/api/admin/products/images/discard', { method: 'POST', body: { paths } })
  : Promise.resolve({ removed: 0 }));

/** Uploads bytes straight to Supabase Storage using the server-issued signed URL. */
export function uploadToSignedUrl(signedUrl, blob, contentType, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('Cache-Control', 'max-age=3600');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve()
      : reject(new ServiceError('UPLOAD_FAILED', 'The upload failed. Retry or choose another image.', { status: xhr.status })));
    xhr.onerror = () => reject(new ServiceError('UPLOAD_FAILED', 'The upload failed. Check your connection and retry.'));
    xhr.onabort = () => reject(new ServiceError('UPLOAD_ABORTED', 'The upload was cancelled.'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

/** Builds the product payload fields for the ordered images in the form. */
export const imageSourcesOf = (items) => items.filter((item) => item.source && item.status !== 'error').map((item) => item.source);
