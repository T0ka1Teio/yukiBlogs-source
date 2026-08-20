import { NextResponse } from 'next/server';
import { getRuntimeContent } from '../../../lib/server/runtimeContent';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    getRuntimeContent(),
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
