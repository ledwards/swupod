import type { Metadata } from 'next'
import '../../src/styles/backgrounds.css'
import './comps.css'
import CompsMatrix from './CompsMatrix'

export const metadata: Metadata = {
  title: 'Pack comparison',
  robots: { index: false, follow: false },
}

export default function CompsPage() {
  return (
    <main className="comps-page page-background">
      <header className="comps-header">
        <h1>Pack comparison</h1>
      </header>

      <section className="comps-intro">
        <p>
          Real Star Wars Unlimited boxes were opened, and every card in each six-pack kit was written down.
          Thousands of kits were then generated on each simulator that builds its own packs, the same packs a player would open there.
          Those kits were collected, and the same statistics were run on every set: how often a card name repeats, how often a kit is crowded with repeats, and the mix of legendaries, rares, specials, uncommons, and commons.
          Each result was set beside the opened boxes and the published pack rate.
        </p>
        <p>
          Green sits with that record. Red misses it. A dash means the site does not publish its packs, so there was nothing to measure.
          Draft, Sealed, Solo, and Multiplayer are whether the site offers that way to play.
          Play vs AI means the site plays a game against you. Real opponent means another person can sit in.
          Sitewide stats are numbers gathered across players. Personal stats are your own record.
        </p>
      </section>

      <section className="comps-board">
        <CompsMatrix />
      </section>
    </main>
  )
}
