export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { uploadOfferImage, deleteImage } from '@/app/lib/offerStorage';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest, AuditAction } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';

// GET /api/offers
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin');
  if (roleError) return roleError;

  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active') === 'true';

    const offers = await prisma.offer.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(offers);
  } catch (err) {
    logger.error('Failed to fetch offers', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

// POST /api/offers
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin');
  if (roleError) return roleError;

  try {
    const { titleEn, titleAr, descriptionEn, descriptionAr, code, expiresAt, imageBase64 } = await req.json() as {
      titleEn: string; titleAr: string;
      descriptionEn?: string; descriptionAr?: string;
      code?: string; expiresAt?: string; imageBase64?: string;
    };

    let imageUrl = '';
    let uploadedPublicId: string | undefined;
    if (imageBase64?.startsWith('data:image')) {
      const result = await uploadOfferImage(imageBase64);
      imageUrl = result.url;
      uploadedPublicId = result.publicId;
    }

    try {
      const offer = await prisma.offer.create({
        data: {
          titleEn, titleAr,
          descriptionEn: descriptionEn ?? null,
          descriptionAr: descriptionAr ?? null,
          code: code ?? null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          imageUrl,
          imageBase64: imageBase64 ?? '',
          isActive: true,
          createdById: user!.id,
        },
      });

      await logAudit(AuditAction.OFFER_CREATED, 'Offer', offer.id, { titleEn }, auditOptsFromRequest(req, user!));
      return NextResponse.json(offer, { status: 201 });
    } catch (dbErr) {
      if (uploadedPublicId) {
        await deleteImage(uploadedPublicId).catch(() => {});
      }
      throw dbErr;
    }
  } catch (err) {
    logger.error('Failed to create offer', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
