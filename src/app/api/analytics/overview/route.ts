export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { apiResponse } from '@/app/lib/apiResponse';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error) return error;
    const roleError = requireRole(user!, 'superadmin', 'admin');
    if (roleError) return roleError;

    const { searchParams } = new URL(req.url);
    const period = Math.min(180, Math.max(1, parseInt(searchParams.get('period') || '30')));

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const cutoff = new Date(now);
    cutoff.setDate(now.getDate() - period);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const prevEnd = new Date(cutoff);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - period);
    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr = prevEnd.toISOString().split('T')[0];

    const allBookings = await prisma.booking.findMany({
      orderBy: { date: 'asc' },
      include: { doctor: { select: { id: true, nameEn: true, nameAr: true } } },
    });

    const currentPeriod = allBookings.filter(b => b.date >= cutoffStr);
    const prevPeriod = allBookings.filter(b => b.date >= prevStartStr && b.date < cutoffStr);

    const totalCur = currentPeriod.length;
    const totalPrv = prevPeriod.length;
    const completedCur = currentPeriod.filter(b => b.status === 'completed').length;
    const completedPrv = prevPeriod.filter(b => b.status === 'completed').length;
    const cancelledCur = currentPeriod.filter(b => b.status === 'cancelled').length;
    const noShowCur = currentPeriod.filter(b => b.status === 'no_show').length;
    const cancelRate = totalCur > 0 ? Math.round((cancelledCur / totalCur) * 100) : 0;
    const noShowRate = totalCur > 0 ? Math.round((noShowCur / totalCur) * 100) : 0;
    const waCur = currentPeriod.filter(b => b.source === 'whatsapp').length;
    const igCur = currentPeriod.filter(b => b.source === 'instagram').length;

    const trendPct = (cur: number, prv: number) => prv === 0 ? 100 : Math.round(((cur - prv) / prv) * 100);

    const dateMap: Record<string, { date: string; total: number; completed: number; cancelled: number }> = {};
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dateMap[key] = { date: key, total: 0, completed: 0, cancelled: 0 };
    }
    currentPeriod.forEach(b => {
      if (dateMap[b.date]) {
        dateMap[b.date].total++;
        if (b.status === 'completed') dateMap[b.date].completed++;
        if (b.status === 'cancelled') dateMap[b.date].cancelled++;
      }
    });
    const trendData = Object.values(dateMap).map(d => ({ ...d, label: d.date.slice(5) }));

    const groupedTrend = period > 30
      ? trendData.reduce((acc: any[], d, i) => {
          const wk = Math.floor(i / 7);
          if (!acc[wk]) acc[wk] = { label: d.label, total: 0, completed: 0, cancelled: 0 };
          acc[wk].total += d.total;
          acc[wk].completed += d.completed;
          acc[wk].cancelled += d.cancelled;
          return acc;
        }, [])
      : trendData;

    const statusCounts: Record<string, number> = {};
    currentPeriod.forEach(b => { statusCounts[b.status] = (statusCounts[b.status] || 0) + 1; });
    const statusBreakdown = Object.entries(statusCounts).map(([k, v]) => ({ name: k, value: v }));

    const sourceCounts: Record<string, number> = {};
    currentPeriod.forEach(b => { const s = b.source || 'dashboard'; sourceCounts[s] = (sourceCounts[s] || 0) + 1; });
    const sourceBreakdown = Object.entries(sourceCounts).map(([k, v]) => ({ name: k, value: v }));

    const doctorMap: Record<string, { name: string; nameEn: string; nameAr: string; total: number; completed: number; cancelled: number; noShow: number }> = {};
    currentPeriod.forEach(b => {
      const docId = typeof b.doctor === 'object' && b.doctor ? b.doctor.id : b.doctorId;
      if (!docId) return;
      if (!doctorMap[docId]) {
        const doc = b.doctor as { nameEn?: string; nameAr?: string } | null;
        doctorMap[docId] = {
          name: doc?.nameEn || 'Unknown',
          nameEn: doc?.nameEn || 'Unknown',
          nameAr: doc?.nameAr || 'Unknown',
          total: 0, completed: 0, cancelled: 0, noShow: 0,
        };
      }
      doctorMap[docId].total++;
      if (b.status === 'completed') doctorMap[docId].completed++;
      if (b.status === 'cancelled') doctorMap[docId].cancelled++;
      if (b.status === 'no_show') doctorMap[docId].noShow++;
    });
    const doctorPerformance = Object.entries(doctorMap)
      .map(([id, d]) => ({ id, ...d, rate: d.total ? Math.round((d.completed / d.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);

    const hourCounts: Record<string, number> = {};
    currentPeriod.forEach(b => {
      const h = b.time?.slice(0, 2);
      if (h) hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const peakHours = Array.from({ length: 13 }, (_, i) => {
      const h = String(i + 7).padStart(2, '0');
      return { hour: `${h}:00`, count: hourCounts[h] || 0 };
    });

    const monthlyCounts: Record<string, { total: number; completed: number }> = {};
    allBookings.forEach(b => {
      const m = b.date?.slice(0, 7);
      if (!m) return;
      if (!monthlyCounts[m]) monthlyCounts[m] = { total: 0, completed: 0 };
      monthlyCounts[m].total++;
      if (b.status === 'completed') monthlyCounts[m].completed++;
    });
    const monthlyTrend = Object.entries(monthlyCounts)
      .map(([month, d]) => ({ month, ...d }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);

    const serviceCounts: Record<string, number> = {};
    currentPeriod.forEach(b => { serviceCounts[b.service] = (serviceCounts[b.service] || 0) + 1; });
    const mostBookedServices = Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return apiResponse({
      period,
      total: { current: totalCur, previous: totalPrv, trend: trendPct(totalCur, totalPrv) },
      completed: { current: completedCur, previous: completedPrv, trend: trendPct(completedCur, completedPrv) },
      cancelled: { current: cancelledCur, rate: cancelRate },
      noShow: { current: noShowCur, rate: noShowRate },
      whatsapp: waCur,
      instagram: igCur,
      trendData: groupedTrend,
      statusBreakdown,
      sourceBreakdown,
      doctorPerformance,
      peakHours,
      monthlyTrend,
      mostBookedServices,
    });
  } catch (err) {
    logger.error('Failed to fetch analytics overview', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
