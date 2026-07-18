import { v2 as cloudinary } from 'cloudinary';
import { logger } from './logger';

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
}

export interface UploadResult {
  url: string;
  publicId: string;
}

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

function extractExtension(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/);
  if (!match) throw new ImageValidationError('Invalid image data URL format');
  return match[1];
}

export function validateImage(base64DataUrl: string): void {
  if (!base64DataUrl || typeof base64DataUrl !== 'string') {
    throw new ImageValidationError('Image data is required');
  }
  if (!base64DataUrl.startsWith('data:image/')) {
    throw new ImageValidationError('Image must be a valid data URL starting with data:image/');
  }
  const ext = extractExtension(base64DataUrl);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new ImageValidationError(`Unsupported image format: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }
  const base64Content = base64DataUrl.split(',')[1];
  if (!base64Content) throw new ImageValidationError('Image data is empty');
  const estimatedBytes = Math.ceil(base64Content.length * 0.75);
  if (estimatedBytes > MAX_IMAGE_SIZE_BYTES) {
    throw new ImageValidationError(`Image too large. Maximum size is ${Math.round(MAX_IMAGE_SIZE_BYTES / 1024 / 1024)} MB`);
  }
}

export function extractPublicId(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
  if (!match) return null;
  return match[1];
}

export async function uploadImage(base64DataUrl: string, folder: string): Promise<UploadResult> {
  validateImage(base64DataUrl);
  const ext = extractExtension(base64DataUrl);
  const base64Content = base64DataUrl.split(',')[1];
  try {
    const result = await cloudinary.uploader.upload(
      `data:image/${ext};base64,${base64Content}`,
      { folder, resource_type: 'image' },
    );
    return { url: result.secure_url, publicId: result.public_id };
  } catch (err) {
    logger.error('[Storage] Cloudinary upload failed', { folder, error: String(err) });
    throw new Error(`Image upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

export async function deleteImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
    logger.info('[Storage] Cloudinary image deleted', { publicId });
  } catch (err) {
    logger.error('[Storage] Cloudinary delete failed', { publicId, error: String(err) });
  }
}

export async function replaceImage(
  newBase64: string,
  oldImageUrl: string | null | undefined,
  folder: string,
): Promise<UploadResult> {
  const result = await uploadImage(newBase64, folder);
  if (oldImageUrl) {
    const oldPublicId = extractPublicId(oldImageUrl);
    if (oldPublicId) {
      await deleteImage(oldPublicId);
    }
  }
  return result;
}
