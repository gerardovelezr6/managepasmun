import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, verifyAccessToken } from '@/lib/access';

// /set-password is opened from an emailed link; the one-time token in the link is its credential.
const OPEN_PATHS = ['/access', '/api/access', '/set-password'];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();

  if (await verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Conference access code required' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/access';
  url.search = '';
  if (pathname !== '/') url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif)$).*)'],
};
