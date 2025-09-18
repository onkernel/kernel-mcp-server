import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';

function getDashboardUrl(): string {
  if (!process.env.DASHBOARD_BASE_URL) {
    throw new Error('DASHBOARD_BASE_URL is not set');
  }
  return process.env.DASHBOARD_BASE_URL
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const params = url.searchParams;

  const configurationId = params.get('configurationId');
  const teamId = params.get('teamId');
  const orgId = params.get('org_id');
  const userId = params.get('user_id') || undefined; // optional passthrough if present
  const next = params.get('next') || undefined;

  if (!configurationId || !orgId) {
    return NextResponse.json({ error: 'Missing configurationId or org_id' }, { status: 400 });
  }

  const secret = process.env.VERCEL_LOGIN_JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const jti = crypto.randomUUID();
  const alg = 'HS256' as const;
  const key = new TextEncoder().encode(secret);

  const token = await new jose.SignJWT({
    configurationId,
    teamId,
    orgId,
    userId,
    next,
  })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setJti(jti)
    .setIssuer('auth-server')
    .setAudience('dashboard')
    .setExpirationTime('10m')
    .sign(key);

  const dash = new URL('/integrations/vercel/login', getDashboardUrl());
  dash.searchParams.set('token', token);
  if (next) dash.searchParams.set('next', next);

  return NextResponse.redirect(dash.toString());
}
