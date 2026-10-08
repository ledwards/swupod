// @ts-nocheck
import './TermsOfService.css'

export interface TermsOfServiceProps {
  onBack?: () => void
}

function TermsOfService({ onBack }: TermsOfServiceProps) {
  return (
    <div className="legal-page">
      <div className="legal-content">
        <h1>Terms of Service</h1>
        <p className="last-updated">Last Updated: {new Date().toLocaleDateString()}</p>

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and using Protect the Pod ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
          </p>
        </section>

        <section>
          <h2>2. No Tournaments for Prizes</h2>
          <p>
            <strong>Protect the Pod is a practice and casual play tool only. You may NOT use this Service to organize,
            host, or participate in tournaments, leagues, or competitions where prizes, money, or other compensation
            are awarded. Any such use is a violation of these Terms and may result in account termination.</strong>
          </p>
        </section>

        <section>
          <h2>3. Description of Service</h2>
          <p>
            Protect the Pod is a web application that simulates opening sealed pods of Star Wars: Unlimited booster packs.
            The Service allows users to generate virtual booster packs, build decks, and share card pools.
          </p>
        </section>

        <section>
          <h2>4. User Accounts</h2>
          <p>
            You may use the Service with or without creating an account. When you create an account using Discord OAuth,
            you are responsible for maintaining the security of your account. You are responsible for all activities that occur under your account.
          </p>
        </section>

        <section>
          <h2>5. User Content</h2>
          <p>
            You retain ownership of any content you create or share through the Service, including card pools and deck configurations.
            By sharing content, you grant us a license to display and distribute that content through the Service.
          </p>
        </section>

        <section>
          <h2>6. Intellectual Property</h2>
          <p>
            The Service and its original content, features, and functionality are owned by Protect the Pod and are protected by international
            copyright, trademark, patent, trade secret, and other intellectual property laws.
          </p>
          <p>
            Star Wars: Unlimited is a trademark of Fantasy Flight Games and The Walt Disney Company. This Service is not affiliated with,
            endorsed by, or sponsored by Fantasy Flight Games or The Walt Disney Company.
          </p>
        </section>

        <section>
          <h2>7. Prohibited Uses</h2>
          <p>You may not use the Service:</p>
          <ul>
            <li>For any unlawful purpose or to solicit others to perform unlawful acts</li>
            <li>To violate any international, federal, provincial, or state regulations, rules, laws, or local ordinances</li>
            <li>To infringe upon or violate our intellectual property rights or the intellectual property rights of others</li>
            <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
            <li>To submit false or misleading information</li>
            <li>To upload or transmit viruses or any other type of malicious code</li>
          </ul>
        </section>

        <section>
          <h2>8. Disclaimer</h2>
          <p>
            The Service is provided "as is" and "as available" without any warranties of any kind, either express or implied.
            We do not guarantee that the Service will be available at all times or that it will be error-free.
          </p>
        </section>

        <section>
          <h2>9. Limitation of Liability</h2>
          <p>
            In no event shall Protect the Pod, its directors, employees, or agents be liable for any indirect, incidental, special,
            consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.
          </p>
        </section>

        <section>
          <h2>10. Changes to Terms</h2>
          <p>
            We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least
            30 days notice prior to any new terms taking effect.
          </p>
        </section>

        <section>
          <h2>11. Contact Information</h2>
          <p>
            If you have any questions about these Terms of Service, please contact us through the Service.
          </p>
        </section>
      </div>
    </div>
  )
}

export default TermsOfService
