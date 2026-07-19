import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { Booking, Doctor, Prisma } from '@prisma/client';

type BookingWithDoctor = Prisma.BookingGetPayload<{
  include: { doctor: { select: { id: true; nameEn: true; nameAr: true } } }
}>;

export function generateAppointmentReportPdf(bookings: BookingWithDoctor[], title: string): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 27);

  const headers = ['#', 'Patient', 'Phone', 'Doctor', 'Date', 'Time', 'Status'];
  const widths = [8, 38, 30, 32, 28, 18, 22];
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
    doc.setFontSize(7.5);
  };

  drawHeader();

  bookings.forEach((b, i) => {
    if (y > 278) {
      doc.addPage();
      y = 20;
      drawHeader();
    }

    const docName = b.doctor?.nameEn || b.doctor?.nameAr || '';

    const row = [String(i + 1), b.name, b.phone, docName, b.date, b.time, b.status.replace('_', '-')];

    let x = 14;
    row.forEach((cell, j) => {
      doc.text(String(cell).substring(0, Math.floor(widths[j] / 1.8)), x + 1, y + 4);
      x += widths[j];
    });

    doc.setDrawColor(230);
    doc.line(14, y + 6, 14 + totalW, y + 6);
    y += 7;
  });

  return doc.output('arraybuffer');
}

export function generateExcel(
  rows: Record<string, unknown>[],
  columns: { header: string; key: string }[]
): Buffer {
  const data = rows.map((r) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((c) => { obj[c.header] = r[c.key] ?? ''; });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function generateCsv(
  rows: Record<string, unknown>[],
  columns: { header: string; key: string }[]
): string {
  const esc = (v: unknown): string => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines: string[] = [];
  lines.push(columns.map((c) => esc(c.header)).join(','));

  rows.forEach((r) => {
    lines.push(columns.map((c) => esc(r[c.key])).join(','));
  });

  return lines.join('\n');
}

export function formatBookingForReport(booking: BookingWithDoctor): Record<string, unknown> {
  const docName = booking.doctor?.nameEn || booking.doctor?.nameAr || '';

  return {
    id: booking.id,
    name: booking.name,
    phone: booking.phone,
    service: booking.service,
    doctor: docName,
    date: booking.date,
    time: booking.time,
    status: booking.status,
    source: booking.source || 'dashboard',
    notes: booking.notes || '',
    createdAt: booking.createdAt ? new Date(booking.createdAt).toISOString().split('T')[0] : '',
  };
}

export function formatDoctorReport(
  doctors: Doctor[],
  bookings: Booking[]
): Record<string, unknown>[] {
  const doctorMap: Record<string, { nameEn: string; nameAr: string; total: number; completed: number; cancelled: number; noShow: number }> = {};

  doctors.forEach((d) => {
    if (!doctorMap[d.id]) {
      doctorMap[d.id] = { nameEn: d.nameEn, nameAr: d.nameAr, total: 0, completed: 0, cancelled: 0, noShow: 0 };
    }
  });

  bookings.forEach((b) => {
    const id = b.doctorId;
    if (!id || !doctorMap[id]) return;

    doctorMap[id].total++;
    if (b.status === 'completed') doctorMap[id].completed++;
    if (b.status === 'cancelled') doctorMap[id].cancelled++;
    if (b.status === 'no_show') doctorMap[id].noShow++;
  });

  return Object.entries(doctorMap)
    .map(([id, d]) => ({
      id,
      doctorNameEn: d.nameEn,
      doctorNameAr: d.nameAr,
      totalBookings: d.total,
      completed: d.completed,
      cancelled: d.cancelled,
      noShow: d.noShow,
      successRate: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
    }))
    .sort((a, b) => b.totalBookings - a.totalBookings);
}
