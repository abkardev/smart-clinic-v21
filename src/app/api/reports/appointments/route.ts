export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';
import { generateAppointmentReportPdf, generateExcel, generateCsv, formatBookingForReport } from '@/app/lib/reports';

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'pdf';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const doctorId = searchParams.get('doctorId');

    const where: Record<string, unknown> = {};

    if (startDate || endDate) {
      const dateFilter: Record<string, string> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      where.date = dateFilter;
    }

    if (status) where.status = status;
    if (doctorId) where.doctorId = doctorId;

    const bookings = await prisma.booking.findMany({
      where,
      include: { doctor: { select: { id: true, nameEn: true, nameAr: true } } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });

    const rows = bookings.map((b) => formatBookingForReport(b));

    const columns = [
      { header: 'ID', key: 'id' },
      { header: 'Patient Name', key: 'name' },
      { header: 'Phone', key: 'phone' },
      { header: 'Service', key: 'service' },
      { header: 'Doctor', key: 'doctor' },
      { header: 'Date', key: 'date' },
      { header: 'Time', key: 'time' },
      { header: 'Status', key: 'status' },
      { header: 'Source', key: 'source' },
      { header: 'Notes', key: 'notes' },
      { header: 'Created', key: 'createdAt' },
    ];

    const filename = `appointments-report-${new Date().toISOString().split('T')[0]}`;

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

    const pdfBuffer = generateAppointmentReportPdf(bookings, 'Appointments Report');
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (err) {
    logger.error('Failed to generate appointments report', { error: String(err) });
    return new Response(JSON.stringify({ message: 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
