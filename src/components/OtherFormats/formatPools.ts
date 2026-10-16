import { otherFormatsHref } from '../../../lib/otherFormats'

const NAMES: Record<string, string> = {
  chaos_sealed: 'Chaos Sealed',
  chaos_draft: 'Chaos Draft',
  rotisserie: 'Rotisserie',
  pack_wars: 'Pack Wars',
  pack_blitz: 'Pack Blitz',
}

/** Display name of a format pool type. */
export const formatPoolName = (poolType: string): string => NAMES[poolType] ?? poolType

/** The one action a "Your Format Pools" row offers, besides delete. */
export function formatPoolAction(poolType: string, shareId: string): { label: string; href: string } {
  const id = encodeURIComponent(shareId)
  switch (poolType) {
    case 'chaos_sealed': return { label: 'Build deck', href: `/pool/${id}/deck` }
    case 'chaos_draft': return { label: 'Resume', href: `/draft/${id}` }
    case 'rotisserie': return { label: 'Resume', href: otherFormatsHref(`rotisserie/${id}`) }
    case 'pack_wars': return { label: 'Resume', href: otherFormatsHref(`pack-wars/${id}`) }
    case 'pack_blitz': return { label: 'Resume', href: otherFormatsHref(`pack-blitz/${id}`) }
    default: return { label: 'Open', href: `/pool/${id}` }
  }
}

/** Multi-set pools store "SHD,TWI"; the row's key art uses the first set. */
export const formatPoolSetCode = (setCode: string | null | undefined): string => (setCode ?? '').split(',')[0]?.trim() ?? ''
