import data from '../../src/data/compsScorecard.json'
import { gradeAll, type Grade, type Reference, type Site } from '../../src/services/compsScore'

export type ScoredSite = Site & { playVsAi: boolean | 'alpha' }

export interface Scorecard {
  measuredAt: string
  set: string
  reference: Reference
  sites: ScoredSite[]
}

export const scorecard = data as unknown as Scorecard

export const grades: Grade[] = gradeAll(scorecard.reference, scorecard.sites)
