export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';
import { jsPDF } from 'jspdf';
import { generateExcel, generateCsv, formatDoctorReport } from '@/app/lib/reports';

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'pdf';

    const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
    const bookings = await prisma.booking.findMany();

    const rows = formatDoctorReport(doctors, bookings);

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
    return new Response(JSON.stringify({ message: 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
