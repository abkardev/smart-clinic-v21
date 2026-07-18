export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { uploadOfferImage, deleteOfferImage } from '@/app/lib/offerStorage';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest, AuditAction } from '@/app/lib/audit';

interface OfferBody {
  titleEn?: string; titleAr?: string;
  descriptionEn?: string; descriptionAr?: string;
  code?: string; expiresAt?: string; isActive?: boolean;
  imageBase64?: string;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const body = await req.json() as OfferBody;

    let imageUrl: string | undefined;
    if (body.imageBase64 !== undefined) {
      const currentOffer = await prisma.offer.findUnique({ where: { id: params.id } });
      if (body.imageBase64?.startsWith('data:image')) {
        const result = await uploadOfferImage(body.imageBase64, `offer_${params.id}_${Date.now()}`);
        imageUrl = result.url;
        if (currentOffer?.imageUrl) await deleteOfferImage(currentOffer.imageUrl);
      } else {
        imageUrl = '';
        if (currentOffer?.imageUrl) await deleteOfferImage(currentOffer.imageUrl);
      }
    }

    const offer = await prisma.offer.update({
      where: { id: params.id },
      data: {
        ...(body.titleEn       !== undefined && { titleEn: body.titleEn }),
        ...(body.titleAr       !== undefined && { titleAr: body.titleAr }),
        ...(body.descriptionEn !== undefined && { descriptionEn: body.descriptionEn }),
        ...(body.descriptionAr !== undefined && { descriptionAr: body.descriptionAr }),
        ...(body.code          !== undefined && { code: body.code }),
        ...(body.expiresAt     !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
        ...(body.isActive      !== undefined && { isActive: body.isActive }),
        ...(imageUrl           !== undefined && { imageUrl }),
        ...(body.imageBase64   !== undefined && { imageBase64: body.imageBase64 as string }),
      },
    });
    await logAudit(AuditAction.OFFER_UPDATED, 'Offer', offer.id, { titleEn: offer.titleEn }, auditOptsFromRequest(req, user!));
    return NextResponse.json(offer);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'P2025') return NextResponse.json({ message: 'Offer not found' }, { status: 404 });
    return NextResponse.json({ message: e.message ?? 'Server error' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const offer = await prisma.offer.delete({ where: { id: params.id } });

    // RELIABILITY FIX: deleteOfferImage() handles both storage backends
    // automatically — Vercel Blob https:// URLs or local /uploads/...
    // paths — so this works correctly regardless of which host this is
    // deployed on, without any code change.
    await deleteOfferImage(offer.imageUrl);

    await logAudit(AuditAction.OFFER_DELETED, 'Offer', params.id, null, auditOptsFromRequest(req, user!));
    return NextResponse.json({ message: 'Offer deleted' });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2025') return NextResponse.json({ message: 'Offer not found' }, { status: 404 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
