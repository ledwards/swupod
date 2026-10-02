import type { Metadata } from 'next'
import '../../src/components/PrivacyPolicy.css'
import './comps.css'

export const metadata: Metadata = {
  title: 'Pack comparison',
  robots: { index: false, follow: false },
}

export default function CompsPage() {
  return (
    <div className="legal-page comps-page">
      <div className="legal-content">
        <h1>Pack comparison</h1>
        <p className="last-updated">Homeworlds sealed. Six packs. 1 Oct 2026.</p>
        <p>
          What a player would notice in the kit. Different printings of a card count as the same card.
          Real numbers are 42 kits from 11 opened Ashes of the Empire boxes.
          Limited Lab is their live generator. SWUDraftSim is what their pack code does, not kits we generated.
        </p>

        <div className="comps-table-wrap">
          <table className="comps-table">
            <thead>
              <tr>
                <th></th>
                <th>Real boxes</th>
                <th>Protect the Pod</th>
                <th>Limited Lab</th>
                <th>SWUDraftSim</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Cards you opened more than one of</th>
                <td data-label="Real boxes">6.2 per kit. 3 of 42 kits had 10 or more</td>
                <td data-label="Protect the Pod">6.5 per kit. 6% had 10 or more</td>
                <td data-label="Limited Lab">7 per kit. 18% had 10 or more. Their own run peaked at 19</td>
                <td data-label="SWUDraftSim">A common or uncommon never repeats</td>
              </tr>
              <tr>
                <th scope="row">Legendaries</th>
                <td data-label="Real boxes">1.6 per kit. None of the 42 kits had zero</td>
                <td data-label="Protect the Pod">1.5 per kit. Every kit has one</td>
                <td data-label="Limited Lab">0.8 per kit. 43% of kits have zero</td>
                <td data-label="SWUDraftSim">About 1.4 per kit. About 1 in 5 kits have zero</td>
              </tr>
              <tr>
                <th scope="row">Rares, legendaries, and specials</th>
                <td data-label="Real boxes">7.3 per kit</td>
                <td data-label="Protect the Pod">7.4 per kit</td>
                <td data-label="Limited Lab">6.3 per kit</td>
                <td data-label="SWUDraftSim">About 7.8 per kit</td>
              </tr>
              <tr>
                <th scope="row">The rare in the pack</th>
                <td data-label="Real boxes">Always a rare or a legendary. Specials were extra cards, 0.2 per kit</td>
                <td data-label="Protect the Pod">Always a rare or a legendary. Specials are extra cards, about 0.3 per kit</td>
                <td data-label="Limited Lab">About one pack in eight, that card is a Special instead</td>
                <td data-label="SWUDraftSim">Always a rare or a legendary. Specials only show up in the foil slot, about 0.6 per kit</td>
              </tr>
              <tr>
                <th scope="row">Leaders</th>
                <td data-label="Real boxes">One in each pack</td>
                <td data-label="Protect the Pod">One in each pack</td>
                <td data-label="Limited Lab">One in each pack</td>
                <td data-label="SWUDraftSim">Six dealt separately. About half the kits have a repeated leader. 1 in 20 kits has only four different leaders</td>
              </tr>
              <tr>
                <th scope="row">Bases</th>
                <td data-label="Real boxes">One in each pack</td>
                <td data-label="Protect the Pod">One in each pack</td>
                <td data-label="Limited Lab">One in each pack</td>
                <td data-label="SWUDraftSim">None. You pick any base</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          On the size of the kit Protect the Pod matches the opened boxes: about six duplicates, about one and a half legendaries, about seven cards you would call a hit.
          Every kit has a legendary, and so did every opened kit.
          Limited Lab is short a legendary and short a hit, and many more of their kits are either empty of legendaries or piled with duplicates.
          SWUDraftSim does not deal a pack a player would open: no base, leaders on the side, and the duplicate commons a real kit has cannot occur.
        </p>
        <p className="comps-note">
          Protect the Pod figures are 400 generated boxes. Every generated kit has a legendary.
          Limited Lab figures are 2,000 kits from the generator the site serves, including their own simulate button.
          SWUDraftSim legendary and hit counts are their slot odds added up.
        </p>
      </div>
    </div>
  )
}
