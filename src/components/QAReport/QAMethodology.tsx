'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import Button from '@/src/components/Button'
import { QAStatusBadge } from './QAStatusBadge'

function Block({ title, wide = false, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`qar-method-block${wide ? ' qar-method-block--wide' : ''}`}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="qar-table-wrap">
      <table className="qar-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

/** How packs are generated and how each check is judged. Today's Reference tab, collapsed at the bottom. */
export function QAMethodology() {
  const [open, setOpen] = useState(false)
  const id = useId()
  // Old /qa#Reference links land here with the methodology open.
  useEffect(() => { if (window.location.hash === '#Reference') setOpen(true) }, [])

  return (
    <section className="mstats-section qar-method" aria-label="Methodology">
      <div className="mstats-section-head">
        <div>
          <h2>Methodology</h2>
          <p>How booster packs are generated in Star Wars: Unlimited and how each check is judged. These rules apply to every set.</p>
        </div>
        <div className="mstats-section-actions">
          <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={id}>
            {open ? 'Hide methodology' : 'Show methodology'}
          </Button>
        </div>
      </div>
      {open && (
        <div id={id} className="mstats-panel qar-method-body">
          <Block title="Pack Structure (16 Cards Total)" wide>
            <p>Every booster pack contains exactly 16 cards in specific slots:</p>
            <Table head={['Slot', 'Count', 'Description']} rows={[
              [<strong key="l">Leader</strong>, '1', 'One leader card from the leader pool. Can upgrade to Hyperspace or Showcase.'],
              [<strong key="b">Base</strong>, '1', 'One base card. Can upgrade to Hyperspace variant.'],
              [<strong key="c">Commons</strong>, '9', 'Nine common cards drawn from alternating aspect belts (A/B pattern). Guarantees all 6 aspects present.'],
              [<strong key="u">Uncommons</strong>, '2-3', 'Two guaranteed uncommons. Third uncommon can upgrade to Rare/Legendary (~18% chance).'],
              [<strong key="r">Rare/Legendary</strong>, '1-2', 'One guaranteed Rare or Legendary. Legendary rate varies by set (see below). Can be 2 if third UC upgrades.'],
              [<strong key="f">Foil</strong>, '1', 'One foil card of any rarity (weighted by set - see below). Can upgrade to Hyperfoil.'],
            ]} />
          </Block>

          <Block title="Rarity Distribution">
            <p><strong>Rare/Legendary Slot (varies by set):</strong></p>
            <ul><li>Sets 1-3: ~14.3% Legendary (6:1 ratio)</li><li>Sets 4+: ~16.7% Legendary (5:1 ratio)</li></ul>
            <p><strong>Third UC Slot Upgrade:</strong></p>
            <ul><li>Sets 1-3: ~18% upgrade rate (1 in 5.5)</li><li>Sets 4+: ~20% upgrade rate (1 in 5)</li></ul>
          </Block>

          <Block title="Leader Distribution">
            <p>Leaders come in two rarities (Common and Rare), but in the leader slot:</p>
            <ul><li>All leaders have equal probability (uniform distribution)</li><li>Rarity is aesthetic/collectibility, not pull rate</li></ul>
          </Block>

          <Block title="Foil Slot Distribution" wide>
            <p>The foil slot uses weighted random selection (weights vary by set):</p>
            <Table head={['Rarity', 'Sets 1-3', 'Sets 4-6']} rows={[
              ['Common', '~78%', '~75%'], ['Uncommon', '~17%', '~17%'], ['Rare', '~5%', '~4%'], ['Legendary', '~0.3%', '~0.3%'], ['Special', '0%', '~4%'],
            ]} />
          </Block>

          <Block title="The Belt System" wide>
            <p><strong>What are Belts?</strong></p>
            <p>Belts are shuffled pools of cards that ensure proper distribution and prevent immediate duplicates. Each belt contains all eligible cards for that slot, shuffled randomly.</p>
            <p><strong>How Belts Work:</strong></p>
            <ol>
              <li>Cards are organized into belts by slot type (leader, base, common A, common B, uncommon, rare/legendary, foil)</li>
              <li>Each belt is shuffled once at the start</li>
              <li>Cards are drawn sequentially from the belt</li>
              <li>When a belt is exhausted, it&apos;s reshuffled and reused</li>
              <li>This prevents the same card from appearing in consecutive packs</li>
            </ol>
            <p><strong>Common Belts (A &amp; B):</strong></p>
            <ul>
              <li><strong>Belt A</strong>: Vigilance, Command, Heroism aspects</li>
              <li><strong>Belt B</strong>: Aggression, Cunning, Villainy aspects</li>
              <li>Packs alternate drawing from A and B (positions 0,2,4,6,8 vs 1,3,5,7)</li>
              <li>Ensures all 6 aspects appear in every pack&apos;s 9 commons</li>
            </ul>
          </Block>

          <Block title="Upgrade System" wide>
            <p>After the base pack is generated, an upgrade pass can replace certain cards with premium versions:</p>
            <Table head={['Upgrade Type', 'Probability', 'Description']} rows={[
              [<strong key="1">Leader &rarr; Showcase</strong>, '~0.35%', 'Showcase leaders (all sets, ~1 in 288 packs). Takes priority over Hyperspace.'],
              [<strong key="2">Leader &rarr; Hyperspace</strong>, '~17%', 'Hyperspace variant of the leader (1 in 6 packs)'],
              [<strong key="3">Base &rarr; Hyperspace</strong>, '~25%', 'Hyperspace variant of the base (1 in 4 packs)'],
              [<strong key="4">Rare &rarr; Hyperspace R/L</strong>, '0%', 'Rare slot is always standard (black border), never Hyperspace'],
              [<strong key="5">3rd UC &rarr; R/L</strong>, '~18-20%', 'Third uncommon upgrades to rare/legendary (varies by set)'],
              [<strong key="6">Foil &rarr; Hyperfoil</strong>, '~2%', 'Ultra-rare Hyperfoil variant (1 in 50 packs, ~1 per 2 boxes)'],
              [<strong key="7">UC 1/2 &rarr; Hyperspace UC</strong>, '~12%', 'First or second uncommon becomes Hyperspace (1 in 8.5 packs)'],
              [<strong key="8">Common &rarr; Hyperspace C</strong>, '~33%', 'One random common becomes Hyperspace variant (1 in 3 packs)'],
            ]} />
          </Block>

          <Block title="Hyperspace Variants">
            <p><strong>What is Hyperspace?</strong></p>
            <p>Hyperspace variants are alternate versions of cards with different art and a blue border. They&apos;re mechanically identical but visually distinct.</p>
            <p><strong>Hyperspace Sources:</strong></p>
            <ul><li>Upgrade passes (listed above)</li><li>Can appear as regular cards or foils</li><li>Special &quot;Hyperfoil&quot; versions are extremely rare</li></ul>
          </Block>

          <Block title="Special Rarity">
            <p><strong>Sets 1-3:</strong></p>
            <ul><li>Special rarity cards exist but don&apos;t appear in standard boosters</li><li>8 special cards per set</li><li>Available through other products only</li></ul>
            <p><strong>Sets 4-6:</strong></p>
            <ul>
              <li>Special rarity can appear in the <strong>foil slot only</strong></li>
              <li>Never in regular rare/legendary slot</li>
              <li>12-16 special cards per set</li>
              <li>Same total output rate as Rare (dynamic multiplier scales for card count)</li>
            </ul>
          </Block>

          <Block title="Showcase Cards">
            <p><strong>What are Showcase Cards?</strong></p>
            <p>Showcase cards are premium variants with special borderless alternate art. They exist in all sets from SOR onwards.</p>
            <p><strong>Showcase Distribution:</strong></p>
            <ul><li>Only leaders can be Showcase</li><li>~0.35% chance (~1 in 288 packs)</li><li>Takes priority over Hyperspace leader upgrade</li><li>Can also appear as foils</li></ul>
          </Block>

          <Block title="Quality Score" wide>
            <p>The Quality Score is a percentage representing overall pack generation health:</p>
            <ul>
              <li><strong>Calculation:</strong> (metrics within expected / total metrics) &times; 100</li>
              <li><strong>Excellent (90-100%):</strong> Nearly all metrics pass validation</li>
              <li><strong>Good (75-89%):</strong> Most metrics pass, minor variances acceptable</li>
              <li><strong>Acceptable (60-74%):</strong> Some metrics failing, may need attention</li>
              <li><strong>Needs Attention (&lt;60%):</strong> Significant issues with pack generation</li>
            </ul>
            <p>The score combines structural checks (pass/fail) and rate metrics (statistical tolerance).</p>
          </Block>

          <Block title="Quality Metrics Explained" wide>
            <p><strong>Structural Validation:</strong></p>
            <ul>
              <li><strong>Pack has exactly 16 cards:</strong> Every pack must contain exactly 16 cards</li>
              <li><strong>Pack has 1 leader:</strong> Exactly one leader card per pack</li>
              <li><strong>Pack has 1 base:</strong> Exactly one base card per pack</li>
              <li><strong>Pack has 9 commons:</strong> Nine common cards (from A/B belts)</li>
              <li><strong>Pack has 1 foil:</strong> Exactly one foil card of any rarity</li>
              <li><strong>All 6 aspects in commons:</strong> The 9 commons must cover all 6 aspects</li>
              <li><strong>No same-treatment duplicates:</strong> No card appears twice with the same treatment</li>
            </ul>
            <p><strong>Rate Validation:</strong></p>
            <ul>
              <li><strong>Legendary Rate:</strong> Sets 1-3: ~14.3% (6:1), Sets 4+: ~16.7% (5:1)</li>
              <li><strong>Hyperspace Leader:</strong> ~17% of leaders should be Hyperspace (1 in 6 packs)</li>
              <li><strong>Hyperspace Base:</strong> ~25% of bases should be Hyperspace (1 in 4 packs)</li>
              <li><strong>Hyperspace Common:</strong> ~33% of packs should have a Hyperspace common (1 in 3)</li>
              <li><strong>Hyperfoil:</strong> ~2% of foils should be Hyperspace Foil variants (1 in 50)</li>
              <li><strong>Showcase Leader:</strong> ~0.35% of leaders should be Showcase (~1 in 288 packs)</li>
            </ul>
            <p><strong>Foil Distribution (Sets 1-3 / Sets 4+):</strong></p>
            <ul>
              <li><strong>Common foils:</strong> Expected ~78% / ~75%</li>
              <li><strong>Uncommon foils:</strong> Expected ~17% / ~17%</li>
              <li><strong>Rare foils:</strong> Expected ~5% / ~4%</li>
              <li><strong>Legendary foils:</strong> Expected ~0.3% / ~0.3%</li>
              <li><strong>Special foils:</strong> Expected 0% / ~4% (Sets 4+ only, same rate as Rare)</li>
            </ul>
          </Block>

          <Block title="Statistical Methods" wide>
            <p><strong>Z-Score (Standard Score):</strong> how many standard deviations an observed value is from the expected value.</p>
            <ul>
              <li>Formula: Z = (observed - expected) / standard_error</li>
              <li>|Z| &lt; 1.96: Within 95% confidence (normal)</li>
              <li>1.96 &lt; |Z| &lt; 2.58: Between 95-99% confidence (outlier)</li>
              <li>|Z| &gt; 2.58: Beyond 99% confidence (extreme outlier)</li>
            </ul>
            <p><strong>Wilson Score Confidence Interval:</strong> used for binomial proportions (rate metrics). More accurate than simple intervals for small samples or extreme probabilities.</p>
            <ul>
              <li>Provides upper and lower bounds for the true rate</li>
              <li>If expected rate falls within the confidence interval, the metric passes</li>
              <li>Handles edge cases (0% or 100% observed) better than simpler methods</li>
            </ul>
            <p><strong>Chi-Squared Goodness-of-Fit Test:</strong> tests whether an observed distribution matches an expected distribution.</p>
            <ul>
              <li>Used for foil rarity distribution (multiple categories)</li>
              <li>p-value &gt; 0.05: Distribution matches expected (pass)</li>
              <li>p-value &lt; 0.05: Significant deviation from expected (fail)</li>
              <li>Reports degrees of freedom (df) = number of categories - 1</li>
            </ul>
          </Block>

          <Block title="Status" wide>
            <p>Every rate metric uses a Z-test to compare actual against expected generation rates:</p>
            <dl className="qar-status-key">
              <div><dt><QAStatusBadge status="pass" /></dt><dd>Within the 95% confidence interval (|Z| &lt; 1.96). Normal statistical variation. No action needed.</dd></div>
              <div><dt><QAStatusBadge status="watch" /></dt><dd>Between 95% and 99% (1.96 &lt; |Z| &lt; 2.58). Statistically unusual but could be random chance. Worth monitoring.</dd></div>
              <div><dt><QAStatusBadge status="fail" /></dt><dd>Beyond the 99% confidence interval (|Z| &gt; 2.58). Very unlikely to occur by chance. May indicate a bug in pack generation.</dd></div>
              <div><dt><QAStatusBadge status="none" /></dt><dd>Not enough samples for reliable statistics. Generate more packs for accurate results.</dd></div>
            </dl>
          </Block>

          <Block title="Expected Pack Opening Results" wide>
            <p><strong>In a typical booster box (24 packs):</strong></p>
            <ul>
              <li><strong>Legendaries:</strong> ~3-4 non-foil + ~0.5 foil = ~4 total (Sets 1-3), ~4-5 total (Sets 4+)</li>
              <li><strong>Rares:</strong> ~20-21 non-foil + ~2 foil = ~22 total</li>
              <li><strong>Hyperfoils:</strong> ~0.5 (about 1 per 2 boxes)</li>
              <li><strong>Showcase Leaders:</strong> ~0.08 per box (~1 per 12 boxes, all sets)</li>
              <li><strong>UC Upgrades:</strong> ~4-5 packs will have 2 rare/legendary</li>
            </ul>
            <p><strong>In a sealed pool (6 packs):</strong></p>
            <ul>
              <li><strong>Legendaries:</strong> ~1 total (0-2 range is normal)</li>
              <li><strong>Rares:</strong> ~5-6 total</li>
              <li><strong>All 6 aspects:</strong> Guaranteed in commons of every pack</li>
              <li><strong>Card+Foil pairs:</strong> 95-99% chance of at least one pair</li>
            </ul>
          </Block>

          <Block title="Set-Specific Rules" wide>
            <Table head={['Rule', 'Sets 1-3 (SOR/SHD/TWI)', 'Sets 4-6 (JTL/LOF/SEC)']} rows={[
              [<strong key="1">Special Rarity</strong>, 'Not in boosters', 'Foil slot only (same rate as Rare)'],
              [<strong key="2">Showcase Leaders</strong>, '~0.35% (1 in 288)', '~0.35% (1 in 288)'],
              [<strong key="3">Legendary Rate</strong>, '~14.3% (6:1 ratio)', '~16.7% (5:1 ratio)'],
              [<strong key="4">Hyperfoil Rate</strong>, '~2% (1 in 50)', '~2% (1 in 50)'],
              [<strong key="5">UC Upgrade Rate</strong>, '~18% (1 in 5.5)', '~20% (1 in 5)'],
              [<strong key="6">Foil Legendary Weight</strong>, '2%', '3%'],
            ]} />
          </Block>

          <Block title="Technical Notes" wide>
            <p><strong>Card Treatments:</strong></p>
            <ul>
              <li><strong>Base:</strong> Normal version of a card (no special treatment)</li>
              <li><strong>Hyperspace:</strong> Blue border alternate art version</li>
              <li><strong>Foil:</strong> Shiny/holographic version (any variant can be foil)</li>
              <li><strong>Hyperspace Foil:</strong> Foil version of Hyperspace variant</li>
              <li><strong>Showcase:</strong> Borderless premium art (leaders only, all sets)</li>
            </ul>
            <p><strong>Duplicate Prevention:</strong></p>
            <ul>
              <li>Same card with same treatment cannot appear twice in one pack</li>
              <li>Different treatments of same card ARE allowed (e.g., normal + foil version)</li>
              <li>Belt system prevents immediate duplicates across consecutive packs</li>
            </ul>
            <p><strong>Aspect Balance:</strong></p>
            <ul>
              <li>All 6 aspects (Vigilance, Command, Aggression, Cunning, Heroism, Villainy) guaranteed in every pack</li>
              <li>Achieved through alternating common belt draws (A/B pattern)</li>
              <li>Belt A: Vigilance, Command, Heroism (positions 0,2,4,6,8)</li>
              <li>Belt B: Aggression, Cunning, Villainy (positions 1,3,5,7)</li>
              <li>9th common position ensures at least one duplicate aspect for deckbuilding</li>
            </ul>
          </Block>
        </div>
      )}
    </section>
  )
}
