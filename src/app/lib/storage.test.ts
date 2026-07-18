import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateImage, extractPublicId, ImageValidationError } from './storage';

// ─── validateImage ─────────────────────────────────────────────────────────

describe('validateImage', () => {
  it('accepts valid JPEG data URL', () => {
    expect(() => validateImage('data:image/jpeg;base64,/9j/4AAQ')).not.toThrow();
  });

  it('accepts valid PNG data URL', () => {
    expect(() => validateImage('data:image/png;base64,iVBORw0KG')).not.toThrow();
  });

  it('accepts valid GIF data URL', () => {
    expect(() => validateImage('data:image/gif;base64,R0lGODlh')).not.toThrow();
  });

  it('accepts valid WebP data URL', () => {
    expect(() => validateImage('data:image/webp;base64,UklGRi')).not.toThrow();
  });

  it('throws ImageValidationError for null', () => {
    expect(() => validateImage(null as unknown as string)).toThrow(ImageValidationError);
  });

  it('throws ImageValidationError for undefined', () => {
    expect(() => validateImage(undefined as unknown as string)).toThrow(ImageValidationError);
  });

  it('throws ImageValidationError for empty string', () => {
    expect(() => validateImage('')).toThrow(ImageValidationError);
  });

  it('throws ImageValidationError for non-data URL string', () => {
    expect(() => validateImage('https://example.com/image.jpg')).toThrow(ImageValidationError);
  });

  it('throws ImageValidationError for unsupported format (svg)', () => {
    expect(() => validateImage('data:image/svg+xml;base64,PHN2Zy')).toThrow(ImageValidationError);
  });

  it('throws ImageValidationError for unsupported format (bmp)', () => {
    expect(() => validateImage('data:image/bmp;base64,Qk1S')).toThrow(ImageValidationError);
  });

  it('throws ImageValidationError for oversized image', () => {
    const largeBase64 = 'A'.repeat(14 * 1024 * 1024); // ~14MB base64 → ~10.5MB binary
    const dataUrl = `data:image/jpeg;base64,${largeBase64}`;
    expect(() => validateImage(dataUrl)).toThrow(ImageValidationError);
    expect(() => validateImage(dataUrl)).toThrow(/too large/i);
  });

  it('accepts image near size limit', () => {
    const nearLimit = 'A'.repeat(13 * 1024 * 1024); // ~13MB base64 → ~9.75MB binary
    const dataUrl = `data:image/png;base64,${nearLimit}`;
    expect(() => validateImage(dataUrl)).not.toThrow();
  });

  it('throws ImageValidationError for empty base64 content', () => {
    expect(() => validateImage('data:image/png;base64,')).toThrow(ImageValidationError);
    expect(() => validateImage('data:image/png;base64,')).toThrow(/empty/i);
  });

  it('throws clear error message for invalid format', () => {
    expect(() => validateImage('not-a-data-url')).toThrow(/must be a valid data URL/i);
  });

  it('throws clear error message for unsupported format', () => {
    expect(() => validateImage('data:image/tiff;base64,SUkqAA')).toThrow(/unsupported image format/i);
  });
});

// ─── extractPublicId ───────────────────────────────────────────────────────

describe('extractPublicId', () => {
  it('extracts publicId from standard Cloudinary URL', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1234/offers/abc123.jpg';
    expect(extractPublicId(url)).toBe('offers/abc123');
  });

  it('extracts publicId from URL without version', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/offers/abc123.png';
    expect(extractPublicId(url)).toBe('offers/abc123');
  });

  it('extracts publicId from URL with nested folder', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v5678/offers/subfolder/img.jpg';
    expect(extractPublicId(url)).toBe('offers/subfolder/img');
  });

  it('returns null for null input', () => {
    expect(extractPublicId(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractPublicId(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractPublicId('')).toBeNull();
  });

  it('returns null for non-Cloudinary URL (Vercel Blob)', () => {
    expect(extractPublicId('https://xxxx.public.blob.vercel-storage.com/offers/img.jpg')).toBeNull();
  });

  it('returns null for relative URL (legacy format)', () => {
    expect(extractPublicId('/uploads/offers/img.jpg')).toBeNull();
  });

  it('returns null for random URL', () => {
    expect(extractPublicId('https://example.com/image.jpg')).toBeNull();
  });
});

// ─── uploadImage (mocked) ──────────────────────────────────────────────────

describe('uploadImage (mocked)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns url and publicId on successful upload', async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/offers/test123',
      public_id: 'offers/test123',
    });

    vi.doMock('cloudinary', () => ({
      v2: {
        config: vi.fn(),
        uploader: { upload: mockUpload, destroy: vi.fn() },
      },
    }));

    const { uploadImage } = await import('./storage');
    const result = await uploadImage('data:image/png;base64,iVBOR', 'offers');
    expect(result.url).toBe('https://res.cloudinary.com/demo/image/upload/v1/offers/test123');
    expect(result.publicId).toBe('offers/test123');
  });

  it('throws on upload failure', async () => {
    const mockUpload = vi.fn().mockRejectedValue(new Error('Upload failed'));

    vi.doMock('cloudinary', () => ({
      v2: {
        config: vi.fn(),
        uploader: { upload: mockUpload, destroy: vi.fn() },
      },
    }));

    const { uploadImage } = await import('./storage');
    await expect(uploadImage('data:image/png;base64,iVBOR', 'offers')).rejects.toThrow(/upload failed/i);
  });

  it('validates before uploading', async () => {
    const mockUpload = vi.fn();

    vi.doMock('cloudinary', () => ({
      v2: {
        config: vi.fn(),
        uploader: { upload: mockUpload, destroy: vi.fn() },
      },
    }));

    const { uploadImage } = await import('./storage');
    await expect(uploadImage('invalid', 'offers')).rejects.toThrow(/must be a valid data URL/i);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

// ─── deleteImage (mocked) ──────────────────────────────────────────────────

describe('deleteImage (mocked)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('calls cloudinary.destroy with publicId', async () => {
    const mockDestroy = vi.fn().mockResolvedValue({ result: 'ok' });

    vi.doMock('cloudinary', () => ({
      v2: {
        config: vi.fn(),
        uploader: { upload: vi.fn(), destroy: mockDestroy },
      },
    }));

    const { deleteImage } = await import('./storage');
    await deleteImage('offers/test123');
    expect(mockDestroy).toHaveBeenCalledWith('offers/test123');
  });

  it('does not throw on delete failure (non-fatal)', async () => {
    const mockDestroy = vi.fn().mockRejectedValue(new Error('Delete failed'));

    vi.doMock('cloudinary', () => ({
      v2: {
        config: vi.fn(),
        uploader: { upload: vi.fn(), destroy: mockDestroy },
      },
    }));

    const { deleteImage } = await import('./storage');
    await expect(deleteImage('offers/missing')).resolves.toBeUndefined();
  });
});

// ─── replaceImage (mocked) ─────────────────────────────────────────────────

describe('replaceImage (mocked)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uploads new and deletes old', async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/offers/new123',
      public_id: 'offers/new123',
    });
    const mockDestroy = vi.fn().mockResolvedValue({ result: 'ok' });

    vi.doMock('cloudinary', () => ({
      v2: {
        config: vi.fn(),
        uploader: { upload: mockUpload, destroy: mockDestroy },
      },
    }));

    const { replaceImage } = await import('./storage');
    const result = await replaceImage(
      'data:image/png;base64,newImg',
      'https://res.cloudinary.com/demo/image/upload/v1/offers/old123.jpg',
      'offers',
    );

    expect(mockUpload).toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalledWith('offers/old123');
    expect(result.url).toBe('https://res.cloudinary.com/demo/image/upload/v1/offers/new123');
    expect(result.publicId).toBe('offers/new123');
  });

  it('uploads new without deleting if no old image', async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/offers/new123',
      public_id: 'offers/new123',
    });
    const mockDestroy = vi.fn();

    vi.doMock('cloudinary', () => ({
      v2: {
        config: vi.fn(),
        uploader: { upload: mockUpload, destroy: mockDestroy },
      },
    }));

    const { replaceImage } = await import('./storage');
    await replaceImage('data:image/png;base64,newImg', null, 'offers');
    expect(mockUpload).toHaveBeenCalled();
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it('does not throw when old image has non-Cloudinary URL', async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/offers/new123',
      public_id: 'offers/new123',
    });

    vi.doMock('cloudinary', () => ({
      v2: {
        config: vi.fn(),
        uploader: { upload: mockUpload, destroy: vi.fn() },
      },
    }));

    const { replaceImage } = await import('./storage');
    await expect(
      replaceImage('data:image/png;base64,newImg', '/uploads/offers/old.jpg', 'offers'),
    ).resolves.toBeDefined();
  });
});

// ─── Backward Compatibility: extractPublicId ───────────────────────────────

describe('Backward compatibility: extractPublicId', () => {
  it('returns null for Vercel Blob URLs (legacy)', () => {
    const blobUrl = 'https://xxxx.public.blob.vercel-storage.com/offers/img-abc123.jpg';
    expect(extractPublicId(blobUrl)).toBeNull();
  });

  it('returns null for local filesystem URLs (legacy)', () => {
    expect(extractPublicId('/uploads/offers/img.jpg')).toBeNull();
  });

  it('returns null for empty and missing', () => {
    expect(extractPublicId('')).toBeNull();
    expect(extractPublicId(null)).toBeNull();
    expect(extractPublicId(undefined)).toBeNull();
  });
});
