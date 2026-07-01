/**
 * Storage adapter — uploads offer images to whichever storage backend
 * fits the current hosting environment, with zero code changes required
 * when switching hosts.
 *
 * - On Vercel: uses Vercel Blob (BLOB_READ_WRITE_TOKEN is auto-injected by
 *   Vercel when you create a Blob store — no manual setup needed).
 * - On any other host (Hostinger, a VPS, a Docker container, etc.): falls
 *   back to writing files directly to disk under `public/uploads/`, which
 *   works correctly as long as the host gives the app a PERSISTENT disk —
 *   true for Hostinger's Node.js hosting and any VPS, but NOT true for
 *   Vercel (whose filesystem resets on every deploy).
 *
 * Detection logic: if BLOB_READ_WRITE_TOKEN exists in the environment, use
 * Blob. Otherwise use the local disk. This means the same codebase deploys
 * correctly to either host without edits — only the environment variables
 * differ.
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface UploadResult {
  url: string; // what gets saved into Offer.imageUrl
}

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'offers');

function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Uploads a base64 data-URL image and returns a URL to store in the DB.
 *  - filenamePrefix should not include an extension; one is derived from
 *    the data URL's mime type.
 */
export async function uploadOfferImage(
  imageBase64: string,
  filenamePrefix: string
): Promise<UploadResult> {
  const ext = imageBase64.substring('data:image/'.length, imageBase64.indexOf(';base64'));
  const buffer = Buffer.from(imageBase64.split(',')[1], 'base64');
  const filename = `${filenamePrefix}.${ext}`;

  if (isBlobConfigured()) {
    // ── Vercel Blob path ──
    const { put } = await import('@vercel/blob');
    const blob = await put(`offers/${filename}`, buffer, {
      access: 'public',
      contentType: `image/${ext}`,
    });
    return { url: blob.url }; // full https:// URL
  }

  // ── Local disk path (Hostinger, VPS, Docker, any persistent-disk host) ──
  await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, filename), buffer);
  // Relative URL served by Next.js's built-in /public static file handler —
  // works identically on any host since it's just a normal static asset.
  return { url: `/uploads/offers/${filename}` };
}

/**
 * Deletes a previously uploaded offer image. Safe to call with any
 * imageUrl format this app has ever produced (Blob https:// URL, or a
 * local /uploads/... relative path) — picks the matching deletion method
 * automatically and never throws on failure (a failed delete just leaves
 * an orphaned file, which is not worth failing the whole request over).
 */
export async function deleteOfferImage(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return;

  try {
    if (imageUrl.startsWith('https://') && isBlobConfigured()) {
      const { del } = await import('@vercel/blob');
      await del(imageUrl);
    } else if (imageUrl.startsWith('/uploads/')) {
      const filepath = path.join(process.cwd(), 'public', imageUrl);
      await fs.unlink(filepath);
    }
    // Any other format (e.g. a legacy URL from a host migration) is left
    // alone — there's nothing safe to do with it automatically.
  } catch (err) {
    console.error('Failed to delete offer image:', err);
    // non-fatal — see function doc comment above
  }
}
