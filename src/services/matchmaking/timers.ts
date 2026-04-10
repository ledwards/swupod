const PACK_TIMEOUTS: Record<number, number> = {
  14: 60,
  13: 40,
  12: 40,
  11: 30,
  10: 30,
  9: 25,
  8: 25,
  7: 20,
  6: 15,
  5: 10,
  4: 10,
  3: 5,
  2: 5,
  1: 0,
}

const LEADER_TIMEOUTS: Record<number, number> = {
  3: 15,
  2: 10,
  1: 0,
}

export function getCompetitivePickTimeout(cardsRemaining: number): number {
  return PACK_TIMEOUTS[cardsRemaining] ?? 0
}

export function getLeaderPickTimeout(leadersRemaining: number): number {
  return LEADER_TIMEOUTS[leadersRemaining] ?? 0
}
