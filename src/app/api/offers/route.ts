export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { uploadOfferImage } from '@/app/lib/offerStorage';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';

// GET /api/offers
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active') === 'true';

    const offers = await prisma.offer.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(offers);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

// POST /api/offers
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const { titleEn, titleAr, descriptionEn, descriptionAr, code, expiresAt, imageBase64 } = await req.json() as {
      titleEn: string; titleAr: string;
      descriptionEn?: string; descriptionAr?: string;
      code?: string; expiresAt?: string; imageBase64?: string;
    };

    // RELIABILITY FIX: image storage now goes through a host-agnostic
    // adapter (see src/app/lib/offerStorage.ts). It automatically uses
    // Vercel Blob when deployed on Vercel, or writes to local disk under
    // public/uploads/ on any other host (Hostinger, a VPS, Docker) where
    // the filesystem is persistent. No code change needed when switching
    // hosting providers — only environment variables differ.
    let imageUrl = '';
    if (imageBase64?.startsWith('data:image')) {
      const result = await uploadOfferImage(imageBase64, `offer_${Date.now()}`);
      imageUrl = result.url;
    }

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

    await logAudit('CREATE_OFFER', 'Offer', offer.id, { titleEn }, auditOptsFromRequest(req, user!));
    return NextResponse.json(offer, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
