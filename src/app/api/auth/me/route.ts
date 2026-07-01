export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/app/lib/auth';

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  return NextResponse.json(user);
}
