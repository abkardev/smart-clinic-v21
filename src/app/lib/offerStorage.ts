import { uploadImage, deleteImage, extractPublicId, validateImage } from './storage';
import { logger } from './logger';

export { ImageValidationError, deleteImage } from './storage';

export interface UploadResult {
  url: string;
  publicId: string;
}

export async function uploadOfferImage(imageBase64: string, _filenamePrefix?: string): Promise<UploadResult> {
  validateImage(imageBase64);
  const result = await uploadImage(imageBase64, 'offers');
  return { url: result.url, publicId: result.publicId };
}

export async function deleteOfferImage(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return;
  const publicId = extractPublicId(imageUrl);
  if (!publicId) {
    logger.warn('[Storage] Could not extract public ID from URL (may be legacy format)', { imageUrl });
    return;
  }
  await deleteImage(publicId);
}
