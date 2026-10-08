// @ts-nocheck
// GET /api/image-proxy?url=<encoded-url>
// Proxies external images to avoid CORS issues when drawing to canvas
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const imageUrl = searchParams.get('url')

  if (!imageUrl) {
    return new Response('Missing url parameter', { status: 400 })
  }

  // Only allow proxying from known card image CDNs for security
  const allowedDomains = [
    'cdn.swu-db.com',
    'swudb.com',
    'cdn.starwarsunlimited.com',
  ]

  let parsedUrl: URL
  try {
    parsedUrl = new URL(imageUrl)
  } catch {
    return new Response('Invalid URL', { status: 400 })
  }

  if (!allowedDomains.some(domain => parsedUrl.hostname.endsWith(domain))) {
    return new Response('Domain not allowed', { status: 403 })
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        // Some CDNs require a user agent
        'User-Agent': 'Mozilla/5.0 (compatible; ProtectThePod/1.0)',
      },
    })

    if (!response.ok) {
      return new Response(`Failed to fetch image: ${response.status}`, { status: response.status })
    }

    const contentType = response.headers.get('content-type') || 'image/png'
    const buffer = await response.arrayBuffer()

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Image proxy error:', error)
    return new Response('Failed to fetch image', { status: 500 })
  }
}
