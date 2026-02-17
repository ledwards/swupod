/**
 * Format Modes Configuration
 *
 * Defines the available alternative limited formats and their access levels.
 *
 * Access levels:
 * - 'open': Available to all users
 * - 'beta': Requires beta access (is_beta_tester or is_admin)
 * - 'coming-soon': Not yet available (shows "Coming Soon" badge)
 */

export interface FormatMode {
  id: string
  name: string
  description: string
  access: 'open' | 'beta' | 'coming-soon'
  cardArt?: string
  artType?: 'event' | 'unit' // event = bottom 50%, unit = 10% from top
  glowColor?: 'red' | 'purple' // default is green
}

// Card art URLs for hover effect (all Hyperspace variants, not foil)
const CARD_ART = {
  misterBones: 'https://cdn.starwarsunlimited.com//card_0302421_EN_Mister_Bones_dcd95db084.png',
  chaosOfWar: 'https://cdn.starwarsunlimited.com//card_0202428_EN_The_Chaos_of_War_248678061a.png',
  letsCallItWar: 'https://cdn.starwarsunlimited.com//card_06020444_EN_Let_s_Call_It_War_45a2c83395.png',
  toppleTheSummit: 'https://cdn.starwarsunlimited.com//card_06020447_EN_Topple_the_Summit_d82f3cefcb.png',
  atst: 'https://cdn.starwarsunlimited.com//card_SWH_01_493_AT_ST_HYP_ff73b562a5.png',
}

export const FORMAT_MODES: FormatMode[] = [
  {
    id: 'chaos-sealed',
    name: 'Chaos Sealed',
    description: 'Open 6 packs from 6 different sets',
    access: 'open',
    cardArt: CARD_ART.chaosOfWar,
    artType: 'event',
    glowColor: 'red',
  },
  {
    id: 'chaos-draft',
    name: 'Chaos Draft',
    description: 'Draft with packs from 3 different sets',
    access: 'open',
    cardArt: CARD_ART.misterBones,
    artType: 'unit',
    glowColor: 'red',
  },
  {
    id: 'pack-wars',
    name: 'Pack Wars',
    description: 'Build deck from 2 packs',
    access: 'open',
    cardArt: CARD_ART.letsCallItWar,
    artType: 'event',
  },
  {
    id: 'pack-blitz',
    name: 'Pack Blitz',
    description: 'Build deck from 1 pack',
    access: 'beta',
    cardArt: CARD_ART.toppleTheSummit,
    artType: 'event',
  },
  {
    id: 'rotisserie',
    name: 'Rotisserie Draft',
    description: 'Snake draft from entire card pool, face-up',
    access: 'coming-soon',
    cardArt: CARD_ART.atst,
    artType: 'unit',
    glowColor: 'purple',
  },
]
