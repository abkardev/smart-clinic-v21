export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

interface TableInfo {
  table: string;
  rowCount: number;
  sizeBytes: number;
  sizePretty: string;
  lastAnalyze: string | null;
  vacuumRecommended: boolean;
}

async function getTableStats(): Promise<TableInfo[]> {
  const tables = ['bookings', 'doctors', 'users', 'audit_logs', 'calendar_sync_jobs', 'whatsapp_sessions', 'rate_limits', 'idempotency_locks', 'blocked_slots', 'holidays', 'offers'];

  const results: TableInfo[] = [];

  for (const table of tables) {
    const raw = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        (SELECT reltuples::bigint FROM pg_class WHERE oid = '${table}'::regclass) AS row_count,
        pg_total_relation_size('${table}') AS total_bytes,
        COALESCE(EXTRACT(epoch FROM (SELECT last_analyze FROM pg_stat_all_tables WHERE relname = '${table}'))::bigint, NULL) AS last_analyze_epoch,
        COALESCE(EXTRACT(epoch FROM (SELECT last_vacuum FROM pg_stat_all_tables WHERE relname = '${table}'))::bigint, NULL) AS last_vacuum_epoch,
        COALESCE(EXTRACT(epoch FROM (SELECT last_autovacuum FROM pg_stat_all_tables WHERE relname = '${table}'))::bigint, NULL) AS last_autovacuum_epoch,
        (SELECT n_dead_tup FROM pg_stat_all_tables WHERE relname = '${table}') AS dead_tuples
    `);

    const row = raw[0] ?? {};
    const totalBytes = Number(row.total_bytes ?? 0);
    const deadTuples = Number(row.dead_tuples ?? 0);
    const rowCount = Number(row.row_count ?? 0);
    const lastAnalyzeEpoch = row.last_analyze_epoch ? Number(row.last_analyze_epoch) : null;

    results.push({
      table,
      rowCount,
      sizeBytes: totalBytes,
      sizePretty: formatBytes(totalBytes),
      lastAnalyze: lastAnalyzeEpoch ? new Date(lastAnalyzeEpoch * 1000).toISOString() : null,
      vacuumRecommended: deadTuples > 1000 && (deadTuples / (rowCount || 1)) > 0.2,
    });
  }

  return results;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

interface IndexInfo {
  table: string;
  index: string;
  sizePretty: string;
  scanCount: number;
  tupleCount: number;
  hitRate: string;
}

async function getIndexUsage(): Promise<IndexInfo[]> {
  const raw = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT
      schemaname,
      tablename AS table_name,
      indexrelname AS index_name,
      idx_scan AS scan_count,
      idx_tup_read AS tuple_read,
      idx_tup_fetch AS tuple_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    ORDER BY idx_scan ASC
  `);

  return raw.map(r => ({
    table: String(r.table_name),
    index: String(r.index_name),
    sizePretty: String(r.index_size),
    scanCount: Number(r.scan_count ?? 0),
    tupleCount: Number(r.tuple_read ?? 0),
    hitRate: Number(r.scan_count ?? 0) > 0 ? '100%' : '0%',
  }));
}

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error) return error;
    const roleError = requireRole(user!, 'superadmin');
    if (roleError) return roleError;

    const [tableStats, indexUsage] = await Promise.all([
      getTableStats(),
      getIndexUsage(),
    ]);

    const vacuumRecommended = tableStats.filter(t => t.vacuumRecommended).map(t => t.table);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tables: tableStats,
      indexUsage,
      recommendations: {
        vacuumRecommended,
        analyzeRecommended: tableStats.filter(t => !t.lastAnalyze).map(t => t.table),
        totalSizeBytes: tableStats.reduce((a, b) => a + b.sizeBytes, 0),
        totalSizePretty: formatBytes(tableStats.reduce((a, b) => a + b.sizeBytes, 0)),
      },
    });
  } catch (err) {
    logger.error('Maintenance endpoint error', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
