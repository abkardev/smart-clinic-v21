export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';
import { generateExcel, generateCsv } from '@/app/lib/reports';

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'pdf';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    const now = new Date();
    const defaultEnd = now.toISOString().split('T')[0];
    const defaultStart = new Date(now);
    defaultStart.setDate(now.getDate() - 30);
    const defaultStartStr = defaultStart.toISOString().split('T')[0];

    const startDate = startDateParam || defaultStartStr;
    const endDate = endDateParam || defaultEnd;

    if (startDate > endDate) {
      return NextResponse.json({ message: 'startDate must be before endDate' }, { status: 400 });
    }

    const daysDiff = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000);
    if (daysDiff > 365) {
      return NextResponse.json({ message: 'Date range must not exceed 365 days' }, { status: 400 });
    }

    const doctors = await prisma.doctor.findMany({ where: { isActive: true } });

    const stats = await prisma.booking.groupBy({
      by: ['doctorId', 'status'],
      _count: { id: true },
      where: {
        date: { gte: startDate, lte: endDate },
        doctorId: { in: doctors.map(d => d.id) },
      },
    });

    const doctorStats: Record<string, { total: number; completed: number; cancelled: number; noShow: number }> = {};
    doctors.forEach(d => {
      doctorStats[d.id] = { total: 0, completed: 0, cancelled: 0, noShow: 0 };
    });
    stats.forEach(s => {
      if (!doctorStats[s.doctorId]) return;
      doctorStats[s.doctorId].total += s._count.id;
      if (s.status === 'completed') doctorStats[s.doctorId].completed += s._count.id;
      if (s.status === 'cancelled') doctorStats[s.doctorId].cancelled += s._count.id;
      if (s.status === 'no_show') doctorStats[s.doctorId].noShow += s._count.id;
    });

    const rows = doctors.map(d => {
      const st = doctorStats[d.id] || { total: 0, completed: 0, cancelled: 0, noShow: 0 };
      return {
        id: d.id,
        doctorNameEn: d.nameEn,
        doctorNameAr: d.nameAr,
        totalBookings: st.total,
        completed: st.completed,
        cancelled: st.cancelled,
        noShow: st.noShow,
        successRate: st.total > 0 ? Math.round((st.completed / st.total) * 100) : 0,
      };
    }).sort((a, b) => b.totalBookings - a.totalBookings);

    const columns = [
      { header: 'ID', key: 'id' },
      { header: 'Doctor Name (EN)', key: 'doctorNameEn' },
      { header: 'Doctor Name (AR)', key: 'doctorNameAr' },
      { header: 'Total Bookings', key: 'totalBookings' },
      { header: 'Completed', key: 'completed' },
      { header: 'Cancelled', key: 'cancelled' },
      { header: 'No-Show', key: 'noShow' },
      { header: 'Success Rate (%)', key: 'successRate' },
    ];

    const filename = `doctors-report-${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      const csv = generateCsv(rows, columns);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const buffer = generateExcel(rows, columns);
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        },
      });
    }

    const pdfRows = rows.map((r) => ({
      name: r.doctorNameEn || r.doctorNameAr,
      total: r.totalBookings,
      completed: r.completed,
      cancelled: r.cancelled,
      noShow: r.noShow,
      rate: r.successRate,
    }));

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Doctor Performance Report', 14, 20);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 27);

    const headers = ['#', 'Doctor', 'Total', 'Done', 'Cancelled', 'No-Show', 'Rate'];
    const widths = [8, 50, 22, 22, 22, 22, 22];
    const totalW = widths.reduce((a, b) => a + b, 0);

    let y = 36;
    const drawHeader = () => {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      let x = 14;
      headers.forEach((h, i) => {
        doc.text(h, x + 1, y + 4);
        x += widths[i];
      });
      doc.setDrawColor(200);
      doc.line(14, y + 6, 14 + totalW, y + 6);
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    };

    drawHeader();

    pdfRows.forEach((r, i) => {
      if (y > 278) {
        doc.addPage();
        y = 20;
        drawHeader();
      }

      const row = [String(i + 1), r.name, String(r.total), String(r.completed), String(r.cancelled), String(r.noShow), `${r.rate}%`];

      let x = 14;
      row.forEach((cell, j) => {
        doc.text(String(cell).substring(0, Math.floor(widths[j] / 2)), x + 1, y + 4);
        x += widths[j];
      });

      doc.setDrawColor(230);
      doc.line(14, y + 6, 14 + totalW, y + 6);
      y += 7;
    });

    const pdfBuffer = doc.output('arraybuffer');
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (err) {
    logger.error('Failed to generate doctors report', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
