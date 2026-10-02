'use client'
import EntryShell from './EntryShell'
import EntryFilterCheckbox from './EntryFilterCheckbox'
import EntryPackFan from './EntryPackFan'
import Button from '../Button'

export type EntryLoadingPage = 'home' | 'draft' | 'sealed' | 'play' | 'ai'
function Line({
  width = '70%',
  height = 16,
}: {
  width?: string
  height?: number
}) {
  return (
    <span
      className="entry-skeleton entry-loading-line"
      aria-hidden="true"
      style={{ width, height }}
    />
  )
}
export function EntryDeckSkeleton({ edit = false }: { edit?: boolean }) {
  return (
    <div
      className={`entry-loading-deck ${edit ? 'entry-loading-deck-edit' : ''}`}
      aria-hidden="true"
    >
      <div className="entry-loading-deck-art entry-skeleton" />
      <Line height={22} />
      <Line width="45%" height={19} />
      {edit && <Line width="100px" height={35} />}
    </div>
  )
}
export function EntrySkeleton({ page = 'home' }: { page?: EntryLoadingPage }) {
  const home = page === 'home',
    ai = page === 'ai',
    play = page === 'play'
  const title = ai
    ? 'Play vs AI'
    : play
      ? 'Play'
      : page === 'draft'
        ? 'Draft'
        : 'Sealed'
  return (
    <EntryShell
      home={home}
      loading
      back={home ? undefined : { label: ai ? 'Back to decks' : 'Back' }}
      banner={
        home ? (
          <div className="entry-promo">
            <div className="entry-skeleton entry-loading-pack" />
            <div>
              <Line width="200px" height={24} />
              <Line width="210px" />
            </div>
          </div>
        ) : undefined
      }
    >
      {home ? (
        <>
          <div className="entry-choices">
            {['Draft', 'Sealed', 'Play'].map((label) => (
              <div className="entry-choice" key={label}>
                <div
                  className="entry-choice-art entry-skeleton"
                  aria-hidden="true"
                />
                <div className="entry-choice-copy">
                  <h2>{label}</h2>
                  <Line />
                </div>
              </div>
            ))}
          </div>
          <div className="entry-discovery">
            <section className="entry-panel">
              <h2>Draft Pods Open</h2>
              <EntryDeckSkeleton />
            </section>
            <section className="entry-panel">
              <h2>Open Lobbies</h2>
              <EntryDeckSkeleton />
            </section>
          </div>
        </>
      ) : (
        <>
          <h1>
            {title}
            {ai && (
              <>
                {' '}
                <span className="entry-beta">Beta</span>
              </>
            )}
          </h1>
          <div className="entry-layout">
            <section className={play ? undefined : 'entry-panel entry-options'}>
              <h2>
                {ai ? 'Your deck' : play ? 'Choose your deck' : 'Choose a set'}
              </h2>
              {ai ? (
                <>
                  <EntryDeckSkeleton edit />
                </>
              ) : play ? (
                <>
                  <Line width="100%" height={32} />
                  <div className="entry-filters">
                    {['All decks', 'Draft', 'Sealed', 'All sets'].map(
                      (label) => (
                        <Button key={label} disabled size="sm">
                          {label}
                        </Button>
                      )
                    )}
                  </div>
                  <div className="entry-filters">
                    <EntryFilterCheckbox label="Complete decks only" checked disabled />
                  </div>
                  <div className="entry-decks">
                    {[0, 1, 2].map((i) => (
                      <EntryDeckSkeleton key={i} edit />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="entry-set-button entry-skeleton"
                    aria-hidden="true"
                  />
                  <h2>Who’s playing?</h2>
                  <div className="entry-toggle">
                    <Button disabled>Practice Solo</Button>
                    <Button disabled>With other players</Button>
                  </div>
                  {page === 'sealed' && (
                    <>
                      <h2>Packs per player</h2>
                      <div className="entry-toggle">
                        <Button disabled>6 packs</Button>
                        <Button disabled>8 packs</Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
            <aside className="entry-panel entry-summary">
              {ai ? (
                <>
                  <h2>AI opponent</h2>
                  <div className="entry-opponent-picker"><div className="entry-toggle entry-opponent-source"><Button disabled>Generated deck</Button><Button disabled>My saved decks</Button></div></div>
                  <div className="entry-opponent-preview"><EntryDeckSkeleton /><Button variant="icon" className="entry-opponent-refresh" aria-label="Generate another opponent" disabled /></div>
                  <p>One practice game</p>
                  <div className="entry-summary-actions"><Button className="entry-go" disabled>
                    Play vs AI
                  </Button>
                  </div>
                </>
              ) : play ? (
                <>
                  <Line height={28} />
                  <div className="entry-action-stack">
                    {['Find opponent', 'Invite friend', 'Play vs AI'].map(
                      (label) => (
                        <Button disabled key={label}>
                          {label}
                          <Line />
                        </Button>
                      )
                    )}
                  </div>
                </>
              ) : (
                <>
                  <EntryPackFan count={page === 'draft' ? 3 : 6} />
                  <Line height={28} />
                  <dl>
                    {['Packs', 'Format', 'Table', 'Next up'].map((label) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>
                          <Line width="100px" />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <Button className="entry-go" disabled>
                    {page === 'draft' ? 'Start practice draft' : 'Open 6 packs'}
                  </Button>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </EntryShell>
  )
}
