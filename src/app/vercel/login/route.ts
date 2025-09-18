import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;

  // Capture Vercel marketplace params
  const configurationId = searchParams.get('configurationId');

  // Require configurationId per Vercel docs
  if (!configurationId) {
    return NextResponse.json({ error: 'Missing configurationId' }, { status: 400 });
  }

  // If the user hasn't picked an org yet, send them to select-org and come back here
  if (!searchParams.get('org_id')) {
    const sel = new URL('/select-org', request.nextUrl.origin);
    // Preserve original params and indicate we should return to this route
    searchParams.forEach((value, key) => {
      sel.searchParams.set(key, value);
    });
    sel.searchParams.set('return_to', '/vercel/login');
    return NextResponse.redirect(sel.toString());
  }

  // Org selected, proceed to confirm step which will mint a JWT and redirect to dashboard
  const confirm = new URL('/vercel/confirm', request.nextUrl.origin);
  searchParams.forEach((value, key) => confirm.searchParams.set(key, value));
  return NextResponse.redirect(confirm.toString());
}
