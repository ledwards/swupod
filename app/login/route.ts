import {sanitizeReturnTo} from '@/lib/auth'
/** Use PTP's existing Discord flow in development and production. */
export function GET(request:Request){
 const url=new URL(request.url),target=new URL('/api/auth/signin/discord',url.origin)
 target.searchParams.set('return_to',sanitizeReturnTo(url.searchParams.get('returnTo')||'/'))
 return Response.redirect(target,303)
}
