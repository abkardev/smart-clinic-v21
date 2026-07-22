import { NextRequest } from 'next/server';

export function getCorrelationId(req: NextRequest): string {
  return req.headers.get('x-correlation-id') || '';
}

export function requestMeta(req: NextRequest, extra?: Record<string, unknown>) {
  return {
    correlationId: getCorrelationId(req),
    method: req.method,
    route: req.nextUrl.pathname,
    environment: process.env.NODE_ENV || 'development',
    ...extra,
  };
}
