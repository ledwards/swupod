// @ts-nocheck
import './PrivacyPolicy.css'

export interface PrivacyPolicyProps {
  onBack?: () => void
}

const DISCORD_INVITE_URL = process.env['NEXT_PUBLIC_DISCORD_INVITE_URL'] || 'https://discord.gg/u6fkdDzWqF'

function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  return (
    <div className="legal-page">
      <div className="legal-content">
        <h1>Privacy Policy</h1>
        <p className="last-updated">Last Updated: October 9, 2026</p>
        <p>
          Protect the Pod (&ldquo;the Service&rdquo;) is a Star Wars: Unlimited draft, sealed and online play simulator at protectthepod.com.
          This policy explains what we collect, why, and the choices you have. It covers the website, online play at play.protectthepod.com,
          and the data we receive from the optional Wayfinder Companion.
        </p>

        <section>
          <h2>1. Information We Collect</h2>
          <ul>
            <li><strong>Account information:</strong> If you sign in with Discord, we collect your Discord user ID, username, avatar and email address (if Discord provides it). We do not receive your Discord password.</li>
            <li><strong>Content you create:</strong> Card pools, decks, draft and sealed runs, chat messages in pods you join, and anything you choose to share.</li>
            <li><strong>Online play records:</strong> When you play a game on our play service, we store the full game record: both decks, every action taken, the board state after each step, and the result. We use it to resolve the game, show stats, and let you rewatch replays.</li>
            <li><strong>Companion gameplay data:</strong> If you install the Wayfinder Companion and play elsewhere with a Protect the Pod pool, we receive the results of those games, including the leaders, bases and archetypes played and your opponent&apos;s public handle, so we can link each game back to your pool.</li>
            <li><strong>Membership status:</strong> If you support us on Patreon, we record whether your membership is active so we can unlock supporter features.</li>
            <li><strong>Technical data:</strong> IP address, browser type, device information, and the pages and features you use.</li>
          </ul>
        </section>

        <section>
          <h2>2. Online Play and Replays</h2>
          <p>
            Games played on our play service run on servers we operate. Your Protect the Pod sign-in is shared across protectthepod.com and its
            subdomains, including play.protectthepod.com, through a session cookie, so you do not sign in twice.
          </p>
          <p>
            Game records are kept so that results, statistics and replays are available to the players in that game. Replays you choose to make
            public appear in an anonymized public replay library where player names are not shown. Spectators of a live game see the board and the
            players&apos; public display names.
          </p>
        </section>

        <section>
          <h2>3. Wayfinder Companion</h2>
          <p>
            The Wayfinder Companion is an optional browser extension that records the online games you play on other platforms and sends the
            results to Protect the Pod. We use this to link each game back to the pool or deck you played, show your card and pool stats, and
            let you rewatch your replays.
          </p>
          <p>
            <strong>Recording is on by default whenever the Companion is signed in.</strong> You can pause it at any time, per game or entirely,
            from the Companion&apos;s toolbar popup, and no games are sent to us while it is paused.
          </p>
          <p>
            The Wayfinder Companion is a separate product; how it captures and stores your games is described in the Wayfinder Privacy Policy at{' '}
            <a href="https://wayfinder.news" target="_blank" rel="noopener noreferrer">wayfinder.news</a>.
          </p>
        </section>

        <section>
          <h2>4. Optional Melee Connection and Event Cosmetics</h2>
          <p>If you connect Melee, Protect the Pod and Wayfinder associate your authenticated Discord account with your Melee account after checking a one-time code in your public Melee Bio. This can connect your Discord identity to the public name and event history on Melee. We never request your Melee password.</p>
          <p>Wayfinder stores the private connection, verification time and notice version. SWUAPI supplies event rewards and participation evidence, and may read your public Bio to check the code; it does not receive your Discord identity. PTP stores your selected cosmetics. Opponents and spectators see selected artwork, not your connection or reason for unlocking it. Supporters can also use cosmetics, so artwork is not proof of attendance or winning a prize.</p>
          <p>You can review, export, disconnect or erase the private connection at <a href="/connections/melee">Melee connection settings</a>. Disconnect removes attendance-based access for new selections and games; current games remain visually stable. Erasing the connection removes its active-service records and reward snapshot; ordinary backups and independent public tournament records are separate. Linking does not change replay or team-sharing permissions. Remove the verification code from your Bio after verification.</p>
        </section>

        <section>
          <h2>5. Patreon Membership</h2>
          <p>
            Supporter features are unlocked by an active Patreon membership. Patreon tells us when a membership starts, changes or ends, and we match
            it to your account by the email address on your Patreon account or the Discord account you have linked on Patreon. We may also assign
            supporter roles to your account in the Protect the Pod Discord server. We do not see your payment details; those stay with Patreon.
          </p>
        </section>

        <section>
          <h2>6. How We Use Your Information</h2>
          <ul>
            <li>Provide, maintain and improve the Service</li>
            <li>Authenticate your account and keep you signed in across protectthepod.com</li>
            <li>Store and display your pools, decks, runs, games and replays</li>
            <li>Run matchmaking, pods and live games with other players</li>
            <li>Enable sharing when you choose to make content public</li>
            <li>Unlock supporter and event features you are entitled to</li>
            <li>Understand how the Service is used so we can improve it</li>
            <li>Respond to your requests and provide support</li>
          </ul>
        </section>

        <section>
          <h2>7. Analytics</h2>
          <p>
            We use PostHog to understand how the Service is used: which pages are visited and which features are used. Analytics run only on the
            production site. Events are linked to your account only when you are signed in; otherwise they are not tied to a profile. We do not
            use advertising networks, and we do not sell analytics data.
          </p>
        </section>

        <section>
          <h2>8. Data Storage</h2>
          <p>
            Your data is stored in our database, hosted with a cloud provider, and associated with your account when you are signed in. Pools and
            decks created without signing in are kept temporarily in your browser. Game records and replays are retained so that stats and
            replays keep working for the players involved.
          </p>
        </section>

        <section>
          <h2>9. Data Sharing</h2>
          <p>We do not sell, trade or rent your personal information. We share information only in these cases:</p>
          <ul>
            <li><strong>Other players:</strong> Your display name, avatar and in-game actions are visible to the other players and any spectators of a pod or game you join.</li>
            <li><strong>Public content:</strong> Pools, decks, runs and replays you make public are accessible to anyone with the link, or in the public replay library.</li>
            <li><strong>Service providers:</strong> Hosting and database providers, Discord (sign-in and server roles), Patreon (membership status), PostHog (analytics), and Wayfinder (Companion games and the Melee connection). Each receives only what it needs for its job.</li>
            <li><strong>Legal requirements:</strong> If required by law or in response to a valid legal request.</li>
          </ul>
        </section>

        <section>
          <h2>10. Cookies and Browser Storage</h2>
          <p>
            We set a session cookie to keep you signed in, shared across protectthepod.com and its subdomains so online play uses the same sign-in.
            We keep preferences such as your chosen theme and table in your browser&apos;s local storage. PostHog stores an identifier in your
            browser so that visits can be counted. We do not use third-party advertising cookies.
          </p>
        </section>

        <section>
          <h2>11. Third-Party Services</h2>
          <ul>
            <li><strong>Discord:</strong> Sign-in uses Discord OAuth. We only receive what Discord provides through its API, and your use of Discord is governed by Discord&apos;s Privacy Policy.</li>
            <li><strong>Patreon:</strong> Membership status, as described in section 5, governed by Patreon&apos;s Privacy Policy.</li>
            <li><strong>PostHog:</strong> Product analytics, as described in section 7.</li>
            <li><strong>Wayfinder:</strong> The Companion extension and the Melee connection, governed by the Wayfinder Privacy Policy.</li>
          </ul>
        </section>

        <section>
          <h2>12. Data Security</h2>
          <p>
            We use appropriate technical and organizational measures to protect your information, including encrypted connections and signed
            session tokens. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2>13. Your Rights and Choices</h2>
          <ul>
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your account and associated data</li>
            <li>Pause Companion recording at any time, and disconnect or erase a Melee connection from its settings page</li>
            <li>Keep pools, decks and replays private, or make them public, at your choice</li>
          </ul>
          <p>
            To exercise these rights, contact us in the Protect the Pod Discord server (link in section 16). Some records, such as a finished
            game&apos;s result as seen by your opponent, may be retained in anonymized form.
          </p>
        </section>

        <section>
          <h2>14. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for children under the age of 13, and we do not knowingly collect personal information from them.
          </p>
        </section>

        <section>
          <h2>15. Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will post the new version on this page and update the &ldquo;Last Updated&rdquo; date.
            For material changes we will also announce the update in the release notes.
          </p>
        </section>

        <section>
          <h2>16. Contact Us</h2>
          <p>
            Questions about this policy or your data: join the{' '}
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Protect the Pod Discord server</a> and message a moderator.
          </p>
        </section>
      </div>
    </div>
  )
}

export default PrivacyPolicy
