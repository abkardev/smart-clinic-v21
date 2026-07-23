import { NextRequest, NextResponse } from 'next/server';
import { exportData } from '@/app/lib/calendarAdmin';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (auth.error) return auth.error;

  const roleErr = requireRole(auth.user, 'superadmin', 'admin');
  if (roleErr) return roleErr;

  try {
    const type = req.nextUrl.searchParams.get('type') ?? 'sync';
    const format = req.nextUrl.searchParams.get('format') ?? 'json';

    if (!['sync', 'conflict', 'retry', 'activity'].includes(type)) {
      return NextResponse.json({ error: `Unknown type: ${type}. Valid: sync, conflict, retry, activity` }, { status: 400 });
    }
    if (!['csv', 'json'].includes(format)) {
      return NextResponse.json({ error: `Unknown format: ${format}. Valid: csv, json` }, { status: 400 });
    }

    const result = await exportData(type, format);
    const contentType = format === 'csv' ? 'text/csv' : 'application/json';

    return new NextResponse(result.content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    logger.error('Export error', { error: String(err) });
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
