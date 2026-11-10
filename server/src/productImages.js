import { randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';

/**
 * Product images live in the public `product-images` Storage bucket. `products.images`
 * stores ordered entries (first = cover): Storage object paths for uploads, or legacy
 * HTTPS URLs that predate uploads. Only paths are ever written by the upload flow.
 */
export const IMAGE_BUCKET = 'product-images';
export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const EXTENSIONS = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const PATH = new RegExp(`^products/(tmp|[A-Za-z0-9][A-Za-z0-9_-]{0,149})/${UUID}\\.(jpg|png|webp)$`);
const invalid = (message, code = 'VALIDATION_ERROR') => { throw new ApiError(400, code, message); };
const storageUnavailable = () => new ApiError(503, 'STORAGE_UNAVAILABLE', 'Image storage is temporarily unavailable. Please retry.');

export const isStoragePath = (value) => typeof value === 'string' && PATH.test(value);
export const isTmpPath = (value) => isStoragePath(value) && value.startsWith('products/tmp/');
export const pathOwner = (value) => value.split('/')[1];

/** The single place a stored image entry becomes a browser URL. */
export function publicImageUrl(entry, base = process.env.SUPABASE_URL) {
  if (typeof entry !== 'string') return null;
  if (!isStoragePath(entry)) return entry.startsWith('https://') ? entry : null;
  if (!base) return null;
  return `${new URL(base).origin}/storage/v1/object/public/${IMAGE_BUCKET}/${entry}`;
}
export const imageUrls = (entries) => (entries ?? []).map((entry) => publicImageUrl(entry)).filter(Boolean);

/** Validates an ordered image list: storage paths or credential-free HTTPS URLs, no duplicates. */
export function imageList(value, max = MAX_IMAGES) {
  if (!Array.isArray(value) || value.length > max) invalid(`Provide at most ${max} images.`);
  const result = value.map((entry) => {
    if (typeof entry !== 'string' || !entry || entry.length > 2048) invalid('Invalid image entry.');
    if (entry.startsWith('products/')) {
      if (!isStoragePath(entry)) invalid('Invalid uploaded image path.');
      return entry;
    }
    let parsed;
    try { parsed = new URL(entry); } catch { invalid('Use HTTPS image URLs.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) invalid('Use HTTPS image URLs without credentials.');
    // Array filters are sent as Postgres array literals; keep entries literal-safe.
    if (/[\s,{}"\\]/.test(entry)) invalid('Image URLs must be percent-encoded.');
    return entry;
  });
  if (new Set(result).size !== result.length) invalid('Each image can only appear once.');
  return result;
}
export const sameImages = (a, b) => a.length === b.length && a.every((entry, index) => entry === b[index]);

/** Identifies JPEG, PNG and WebP from their leading bytes. */
export function sniffImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return 'image/png';
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Validates an upload request before a signed URL is issued. */
export function uploadRequest(body) {
  const { fileName, contentType, size, count } = body;
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 255) invalid('Provide the image file name.');
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!Object.hasOwn(IMAGE_TYPES, contentType) || EXTENSIONS[extension] !== contentType) {
    invalid('Use a JPG, PNG or WebP image.', 'UNSUPPORTED_IMAGE_TYPE');
  }
  if (!Number.isSafeInteger(size) || size < 1) invalid('Provide the image size in bytes.');
  if (size > MAX_IMAGE_BYTES) invalid('Images must be 5 MB or smaller.', 'IMAGE_TOO_LARGE');
  if (!Number.isSafeInteger(count) || count < 0) invalid('Provide the current image count.');
  if (count >= MAX_IMAGES) invalid(`A product can have at most ${MAX_IMAGES} images.`, 'TOO_MANY_IMAGES');
  return { extension: IMAGE_TYPES[contentType], contentType };
}

/** Storage operations. Uses the server's secret-key client; never exposed to browsers. */
export function createProductImages(storage) {
  const bucket = () => storage.from(IMAGE_BUCKET);
  async function attempt(operation) {
    let result;
    try { result = await operation(); } catch { throw storageUnavailable(); }
    return result ?? {};
  }
  async function signUpload(owner, extension) {
    const path = `products/${owner}/${randomUUID()}.${extension}`;
    const { data, error } = await attempt(() => bucket().createSignedUploadUrl(path));
    if (error || typeof data?.signedUrl !== 'string' || !data.signedUrl.startsWith('https://')) throw storageUnavailable();
    return { path, signedUrl: data.signedUrl };
  }
  /** Confirms each uploaded object exists, is within limits, and really is the declared type. */
  async function verify(paths) {
    for (const path of paths) {
      const { data, error } = await attempt(() => bucket().download(path));
      if (error || !data || typeof data.arrayBuffer !== 'function') {
        if (error && !(error.status === 400 || error.status === 404 || error.statusCode === '404')) throw storageUnavailable();
        invalid('An image upload did not finish. Remove it and upload again.', 'IMAGE_UPLOAD_MISSING');
      }
      const bytes = new Uint8Array(await data.slice(0, 12).arrayBuffer());
      const type = sniffImageType(bytes);
      if (data.size < 1 || data.size > MAX_IMAGE_BYTES || !type || IMAGE_TYPES[type] !== path.split('.').pop()) {
        await remove([path]);
        invalid('An uploaded file is not a valid JPG, PNG or WebP image under 5 MB.', 'INVALID_IMAGE');
      }
    }
  }
  /** Moves tmp uploads under the product. On failure, already-moved files are moved back. */
  async function attach(paths, productId) {
    const moved = new Map();
    for (const path of paths) {
      const target = `products/${productId}/${path.split('/').pop()}`;
      const { error } = await attempt(() => bucket().move(path, target)).catch((failure) => ({ error: failure }));
      if (error) { await detach(moved); throw storageUnavailable(); }
      moved.set(path, target);
    }
    return moved;
  }
  async function detach(moved) {
    for (const [source, target] of moved) {
      try { await bucket().move(target, source); } catch { /* left for manual cleanup; see docs/product-images.md */ }
    }
  }
  /** Best-effort deletion; callers decide which paths are safe to delete. */
  async function remove(paths) {
    if (!paths.length) return true;
    try { return !(await bucket().remove(paths))?.error; } catch { return false; }
  }
  return { signUpload, verify, attach, detach, remove };
}
