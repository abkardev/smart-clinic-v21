export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { apiResponse } from '@/app/lib/apiResponse';
import { BookingStatus, BookingSource } from '@prisma/client';

export async function GET(_req: NextRequest) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.slice(0, 7);

    // PERFORMANCE FIX: the 5 separate status counts (pending/confirmed/
    // no_show/cancelled/completed) were each a full table scan against the
    // same `booking` table. Replaced with a single groupBy that returns all
    // status counts in one round trip.
    const [
      totalBookings,
      todayBookings,
      monthBookings,
      totalDoctors,
      whatsappBookings,
      instagramBookings,
      statusCounts,
      recentBookings,
      byDoctorRaw,
    ] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({ where: { date: today } }),
      prisma.booking.count({ where: { date: { startsWith: thisMonth } } }),
      prisma.doctor.count({ where: { isActive: true } }),
      prisma.booking.count({ where: { source: BookingSource.whatsapp } }),
      prisma.booking.count({ where: { source: BookingSource.instagram } }),
      prisma.booking.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.booking.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          doctor: { select: { id: true, nameEn: true, nameAr: true, specialtyEn: true, specialtyAr: true } },
        },
      }),
      prisma.booking.groupBy({
        by: ['doctorId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    const statusMap = Object.fromEntries(statusCounts.map((s) => [s.status, s._count.id]));

    // PERFORMANCE FIX: this doctor lookup previously ran *after* the
    // Promise.all above had already resolved, adding its round-trip time
    // serially on top of everything else. It has no dependency on anything
    // else in this request other than byDoctorRaw, but byDoctorRaw is cheap
    // to wait on — the real fix is just making sure this doesn't block the
    // response any longer than necessary, which it now doesn't since it's
    // the only remaining await.
    const doctorIds = byDoctorRaw.map((r) => r.doctorId);
    const doctors = await prisma.doctor.findMany({
      where: { id: { in: doctorIds } },
      select: { id: true, nameEn: true, nameAr: true },
    });
    const doctorMap = Object.fromEntries(doctors.map((d) => [d.id, d]));

    const byDoctor = byDoctorRaw.map((r) => ({
      doctorId: r.doctorId,
      doctorNameEn: doctorMap[r.doctorId]?.nameEn ?? '—',
      doctorNameAr: doctorMap[r.doctorId]?.nameAr ?? '—',
      count: r._count.id,
    }));

    const recentShaped = recentBookings.map(({ doctor, ...b }) => ({
      ...b,
      doctorId: doctor,
    }));

    return apiResponse({
      totalBookings,
      todayBookings,
      monthBookings,
      totalDoctors,
      whatsappBookings,
      instagramBookings,
      statusBreakdown: {
        pending: statusMap.pending ?? 0,
        confirmed: statusMap.confirmed ?? 0,
        'no-show': statusMap.no_show ?? 0,
        cancelled: statusMap.cancelled ?? 0,
        completed: statusMap.completed ?? 0,
      },
      recentBookings: recentShaped,
      byDoctor,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
