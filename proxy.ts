import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Check maintenance mode
  if (process.env.MAINTENANCE_MODE === 'true') {
    // Allow access to maintenance page and static assets
    const { pathname } = request.nextUrl
    if (
      pathname === '/maintenance' ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/icons') ||
      pathname.startsWith('/images') ||
      pathname === '/favicon.ico'
    ) {
      return NextResponse.next()
    }

    // Redirect everything else to maintenance page
    return NextResponse.redirect(new URL('/maintenance', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/health).*)'], // Allow health checks through
}
