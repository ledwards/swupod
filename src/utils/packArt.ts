// @ts-nocheck
// Pack art URL mappings for Star Wars Unlimited sets
//
// To find pack art URLs:
// 1. Visit official Star Wars Unlimited website: https://starwarsunlimited.com
// 2. Check product pages on Fantasy Flight Games website
// 3. Look for images on retailer sites (Amazon, etc.) - right-click and "Copy Image Address"
// 4. Check image hosting services (Imgur, etc.) for community-uploaded pack art
// 5. Look for CDN URLs from official sources
//
// Once you find a working URL, update the corresponding entry below.
// URLs should point directly to image files (.jpg, .png, etc.)

import type { SetCode } from '../types'

/**
 * Expansion art URL mappings for each set (background key art)
 * Images sourced from https://starwarsunlimited.com/products
 * Using key art images from the official Star Wars Unlimited website
 */
const EXPANSION_ART_URLS: Record<string, string> = {
  // Spark of Rebellion - Set 1
  SOR: '/expansion-art/sor.jpg',
  // Shadows of the Galaxy - Set 2
  SHD: '/expansion-art/shd.jpg',
  // Twilight of the Republic - Set 3
  TWI: '/expansion-art/twi.png',
  // Jump to Lightspeed - Set 4
  JTL: '/expansion-art/jtl.jpg',
  // Legends of the Force - Set 5
  LOF: '/expansion-art/lof.png',
  // Secrets of Power - Set 6
  SEC: '/expansion-art/sec.png',
  // A Lawless Time - Set 7
  LAW: '/expansion-art/law.png',
  // Ashes of the Empire - Set 8
  ASH: '/expansion-art/ash.png',
}

/**
 * Booster pack image URLs (the actual pack, not background art)
 * Used for pack opening animation — default (variant 1)
 */
const PACK_IMAGE_URLS: Record<string, string> = {
  SOR: '/pack-images/sor-pack-1.png',
  SHD: '/pack-images/shd-pack-1.png',
  TWI: '/pack-images/twi-pack-1.png',
  JTL: '/pack-images/jtl-pack-1.png',
  LOF: '/pack-images/lof-pack-1.png',
  SEC: '/pack-images/sec-pack-1.png',
  LAW: '/pack-images/law-pack-1.png',
  ASH: '/expansion-art/ash.png',
  'JTL-CB': '/pack-images/jtl-cb-pack.png',
  'LOF-CB': '/pack-images/lof-cb-pack.png',
  'SEC-CB': '/pack-images/sec-cb-pack.png',
  'LAW-CB': '/pack-images/law-cb-pack.png',
  'ASH-CB': '/expansion-art/ash.png',
}

/**
 * All pack art variants per set (3 variants for standard, 1 for carbonite)
 */
const PACK_IMAGE_VARIANTS: Record<string, string[]> = {
  SOR: ['/pack-images/sor-pack-1.png', '/pack-images/sor-pack-2.png', '/pack-images/sor-pack-3.png'],
  SHD: ['/pack-images/shd-pack-1.png', '/pack-images/shd-pack-2.png', '/pack-images/shd-pack-3.png'],
  TWI: ['/pack-images/twi-pack-1.png', '/pack-images/twi-pack-2.png', '/pack-images/twi-pack-3.png'],
  JTL: ['/pack-images/jtl-pack-1.png', '/pack-images/jtl-pack-2.png', '/pack-images/jtl-pack-3.png'],
  LOF: ['/pack-images/lof-pack-1.png', '/pack-images/lof-pack-2.png', '/pack-images/lof-pack-3.png'],
  SEC: ['/pack-images/sec-pack-1.png', '/pack-images/sec-pack-2.png', '/pack-images/sec-pack-3.png'],
  LAW: ['/pack-images/law-pack-1.png', '/pack-images/law-pack-2.png', '/pack-images/law-pack-3.png'],
  ASH: ['/expansion-art/ash.png'],
  'JTL-CB': ['/pack-images/jtl-cb-pack.png'],
  'LOF-CB': ['/pack-images/lof-cb-pack.png'],
  'SEC-CB': ['/pack-images/sec-cb-pack.png'],
  'LAW-CB': ['/pack-images/law-cb-pack.png'],
  'ASH-CB': ['/expansion-art/ash.png'],
}

/**
 * Get expansion art URL for a set code (background key art)
 * Returns the URL if available, or null if not set
 */
export function getPackArtUrl(setCode: SetCode | string): string | null {
  return EXPANSION_ART_URLS[setCode] || null
}

/**
 * Get booster pack image URL for a set code (the actual pack)
 * Used for pack opening animation
 * Returns the URL if available, or a default pack image
 */
export function getPackImageUrl(setCode: SetCode | string): string {
  return PACK_IMAGE_URLS[setCode] || '/pack-images/default-pack.png'
}

/**
 * Get cycling pack image URLs for a set (1,2,3,1,2,3,...)
 * Used for initial pack display in sealed pools
 */
export function getCyclingPackImageUrls(setCode: SetCode | string, count: number): string[] {
  const variants = PACK_IMAGE_VARIANTS[setCode] || [getPackImageUrl(setCode)]
  return Array.from({ length: count }, (_, i) => variants[i % variants.length])
}

/**
 * Get random pack image URLs for a set
 * Used after shuffling packs
 */
export function getRandomPackImageUrls(setCode: SetCode | string, count: number): string[] {
  const variants = PACK_IMAGE_VARIANTS[setCode] || [getPackImageUrl(setCode)]
  return Array.from({ length: count }, () => variants[Math.floor(Math.random() * variants.length)])
}

/**
 * Get a random pack image variant for a single set code
 * Used for chaos sealed where each pack may be a different set
 */
export function getRandomPackImageUrl(setCode: SetCode | string): string {
  const variants = PACK_IMAGE_VARIANTS[setCode] || [getPackImageUrl(setCode)]
  return variants[Math.floor(Math.random() * variants.length)]
}

/**
 * Set expansion art URL for a set code
 * Useful for updating URLs programmatically
 */
export function setPackArtUrl(setCode: SetCode | string, url: string): void {
  EXPANSION_ART_URLS[setCode] = url
}
