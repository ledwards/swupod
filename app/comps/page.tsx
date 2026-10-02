import type { Metadata } from 'next'
import '../../src/components/PrivacyPolicy.css'
import './comps.css'

export const metadata: Metadata = {
  title: 'Pack comparison',
  robots: { index: false, follow: false },
}

type Tone = 'good' | 'bad'

function Ratio({ values, tones }: { values: string[], tones: Tone[] }) {
  return (
    <>
      {values.map((value, i) => (
        <span key={i}>
          {i > 0 && <span className="comps-sep"> : </span>}
          <span className={tones[i]}>{value}</span>
        </span>
      ))}
    </>
  )
}

export default function CompsPage() {
  return (
    <div className="legal-page comps-page">
      <div className="legal-content">
        <h1>Pack comparison</h1>
        <p className="last-updated">Six-pack kit. Per kit.</p>

        <div className="comps-table-wrap">
          <table className="comps-table">
            <thead>
              <tr>
                <th></th>
                <th>Standard</th>
                <th>Protect the Pod</th>
                <th>Limited Lab</th>
                <th>SWUDraftSim</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Duplicates</th>
                <td>6.2</td>
                <td data-label="Protect the Pod" className="good">6.5</td>
                <td data-label="Limited Lab" className="bad">7.0</td>
                <td data-label="SWUDraftSim" className="bad">0</td>
              </tr>
              <tr>
                <th scope="row">10+ duplicates</th>
                <td>7%</td>
                <td data-label="Protect the Pod" className="good">7%</td>
                <td data-label="Limited Lab" className="bad">18%</td>
                <td data-label="SWUDraftSim" className="bad">0%</td>
              </tr>
              <tr>
                <th scope="row">L : R : S : U : C</th>
                <td>1.6 : 5.5 : 0.2 : 17.8 : 58.9</td>
                <td data-label="Protect the Pod">
                  <Ratio
                    values={['1.5', '5.6', '0.3', '17.6', '59.0']}
                    tones={['good', 'good', 'good', 'good', 'good']}
                  />
                </td>
                <td data-label="Limited Lab">
                  <Ratio
                    values={['0.8', '5.4', '0.1', '18.7', '59.0']}
                    tones={['bad', 'good', 'good', 'good', 'good']}
                  />
                </td>
                <td data-label="SWUDraftSim">
                  <Ratio
                    values={['1.4', '5.8', '0.6', '19.2', '57.0']}
                    tones={['good', 'good', 'bad', 'bad', 'bad']}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="comps-note">
          Duplicates are repeated card names. L : R : S : U : C is legendaries, rares, specials, uncommons, commons.
          Standard is the published pack rate, and the opened-pack rate where none was published.
        </p>
      </div>
    </div>
  )
}
