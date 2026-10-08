// @ts-nocheck
import './PrivacyPolicy.css'

export interface PrivacyPolicyProps {
  onBack?: () => void
}

function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  return (
    <div className="legal-page">
      <div className="legal-content">
        <h1>Privacy Policy</h1>
        <p className="last-updated">Last Updated: {new Date().toLocaleDateString()}</p>

        <section>
          <h2>1. Information We Collect</h2>
          <p>
            When you use Protect the Pod, we may collect the following information:
          </p>
          <ul>
            <li><strong>Account Information:</strong> If you sign in with Discord, we collect your Discord user ID, username, and email address (if provided by Discord).</li>
            <li><strong>Usage Data:</strong> We may collect information about how you use the Service, including card pools you create, decks you build, and content you share.</li>
            <li><strong>Gameplay Data:</strong> If you install the Wayfinder Companion and play online with a Protect the Pod pool, we receive the results of those games — including the leaders, bases, and archetypes played, and your opponent&apos;s public handle — so we can link each game back to your pool for stats and replays.</li>
            <li><strong>Technical Data:</strong> We automatically collect certain technical information, such as your IP address, browser type, and device information.</li>
          </ul>
        </section>

        <section>
          <h2>2. Gameplay Recording &amp; Replays</h2>
          <p>
            The Wayfinder Companion is an optional browser extension that records the online games you play and sends the results to Protect the Pod.
            We use this to link each game back to the pool or deck you played, show your card and pool stats, and let you rewatch your replays.
          </p>
          <p>
            <strong>Recording is on by default whenever the Companion is signed in.</strong> You can pause it at any time — per game or entirely — from the
            Companion&apos;s toolbar popup, and no games are sent to us while it is paused. Replays you choose to make public appear in an anonymized public
            replay library where player names are never shown.
          </p>
          <p>
            The Wayfinder Companion is a separate product; how it captures and stores your games is described in the Wayfinder Privacy Policy at{' '}
            <a href="https://wayfinder.news" target="_blank" rel="noopener noreferrer">wayfinder.news</a>.
          </p>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve the Service</li>
            <li>Authenticate your account and manage your user session</li>
            <li>Store and display your card pools and deck configurations</li>
            <li>Enable sharing features when you choose to make content public</li>
            <li>Respond to your requests and provide customer support</li>
            <li>Monitor and analyze usage patterns to improve the Service</li>
          </ul>
        </section>

        <section>
          <h2>4. Data Storage</h2>
          <p>
            Your data is stored securely using industry-standard practices. Card pools and deck configurations are stored in our database
            and associated with your account (if you are signed in) or stored temporarily in your browser session (if you are not signed in).
          </p>
        </section>

        <section>
          <h2>5. Data Sharing</h2>
          <p>
            We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
          </p>
          <ul>
            <li><strong>Public Content:</strong> If you choose to make a card pool or deck public, it will be accessible to anyone with the share link.</li>
            <li><strong>Service Providers:</strong> We may share information with third-party service providers who assist us in operating the Service (e.g., hosting providers, database services).</li>
            <li><strong>Legal Requirements:</strong> We may disclose information if required by law or in response to valid legal requests.</li>
          </ul>
        </section>

        <section>
          <h2>6. Cookies and Tracking</h2>
          <p>
            We use cookies and similar technologies to maintain your session and remember your preferences.
            We do not use third-party tracking cookies or advertising cookies.
          </p>
        </section>

        <section>
          <h2>7. Third-Party Services</h2>
          <p>
            The Service uses Discord OAuth for authentication. When you sign in with Discord, you are subject to Discord's Privacy Policy.
            We only receive the information that Discord provides through their OAuth API.
          </p>
        </section>

        <section>
          <h2>8. Data Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your personal information.
            However, no method of transmission over the Internet or electronic storage is 100% secure.
          </p>
        </section>

        <section>
          <h2>9. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your account and associated data</li>
            <li>Opt out of certain data collection practices</li>
          </ul>
          <p>
            To exercise these rights, please contact us through the Service.
          </p>
        </section>

        <section>
          <h2>10. Children's Privacy</h2>
          <p>
            The Service is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13.
          </p>
        </section>

        <section>
          <h2>11. Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page
            and updating the "Last Updated" date.
          </p>
        </section>

        <section>
          <h2>12. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us through the Service.
          </p>
        </section>
      </div>
    </div>
  )
}

export default PrivacyPolicy
