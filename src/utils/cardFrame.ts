export interface CardFrameCard {
  type?: string | null
  isLeader?: boolean | null
  isBase?: boolean | null
}

export function isLeaderCard(card: CardFrameCard | null | undefined): boolean {
  return card?.isLeader === true || card?.type === 'Leader'
}

export function isBaseCard(card: CardFrameCard | null | undefined): boolean {
  return card?.isBase === true || card?.type === 'Base'
}
