/** Only the public production site contributes to audience analytics. */
export function isProductionAnalyticsHost(hostname: string): boolean {
  return hostname === 'www.protectthepod.com' || hostname === 'protectthepod.com'
}
