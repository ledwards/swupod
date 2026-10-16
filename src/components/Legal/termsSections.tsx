/**
 * The Terms of Service text, section by section. The legacy page and the
 * themed alpha page both render from this list, so the legal text lives in
 * one place. Edit wording here only with Lee's sign-off.
 */
import type { LegalSection } from './types'

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'acceptance-of-terms',
    heading: '1. Acceptance of Terms',
    body: (
      <>
        <p>
          By accessing and using Protect the Pod ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
        </p>
      </>
    ),
  },
  {
    id: 'no-play-for-prizes',
    heading: '2. No Tournaments for Prizes',
    alphaHeading: '2. No Play for Prizes',
    body: (
      <>
        <p>
          <strong>Protect the Pod is a practice and casual play tool only. You may NOT use this Service to organize,
          host, or participate in tournaments, leagues, or competitions where prizes, money, or other compensation
          are awarded. Any such use is a violation of these Terms and may result in account termination.</strong>
        </p>
      </>
    ),
  },
  {
    id: 'description-of-service',
    heading: '3. Description of Service',
    body: (
      <>
        <p>
          Protect the Pod is a web application that simulates opening sealed pods of Star Wars: Unlimited booster packs.
          The Service allows users to generate virtual booster packs, build decks, and share card pools.
        </p>
      </>
    ),
  },
  {
    id: 'user-accounts',
    heading: '4. User Accounts',
    body: (
      <>
        <p>
          You may use the Service with or without creating an account. When you create an account using Discord OAuth,
          you are responsible for maintaining the security of your account. You are responsible for all activities that occur under your account.
        </p>
      </>
    ),
  },
  {
    id: 'user-content',
    heading: '5. User Content',
    body: (
      <>
        <p>
          You retain ownership of any content you create or share through the Service, including card pools and deck configurations.
          By sharing content, you grant us a license to display and distribute that content through the Service.
        </p>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    heading: '6. Intellectual Property',
    body: (
      <>
        <p>
          The Service and its original content, features, and functionality are owned by Protect the Pod and are protected by international
          copyright, trademark, patent, trade secret, and other intellectual property laws.
        </p>
        <p>
          Star Wars: Unlimited is a trademark of Fantasy Flight Games and The Walt Disney Company. This Service is not affiliated with,
          endorsed by, or sponsored by Fantasy Flight Games or The Walt Disney Company.
        </p>
      </>
    ),
  },
  {
    id: 'prohibited-uses',
    heading: '7. Prohibited Uses',
    body: (
      <>
        <p>You may not use the Service:</p>
        <ul>
          <li>For any unlawful purpose or to solicit others to perform unlawful acts</li>
          <li>To violate any international, federal, provincial, or state regulations, rules, laws, or local ordinances</li>
          <li>To infringe upon or violate our intellectual property rights or the intellectual property rights of others</li>
          <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
          <li>To submit false or misleading information</li>
          <li>To upload or transmit viruses or any other type of malicious code</li>
        </ul>
      </>
    ),
  },
  {
    id: 'disclaimer',
    heading: '8. Disclaimer',
    body: (
      <>
        <p>
          The Service is provided "as is" and "as available" without any warranties of any kind, either express or implied.
          We do not guarantee that the Service will be available at all times or that it will be error-free.
        </p>
      </>
    ),
  },
  {
    id: 'limitation-of-liability',
    heading: '9. Limitation of Liability',
    body: (
      <>
        <p>
          In no event shall Protect the Pod, its directors, employees, or agents be liable for any indirect, incidental, special,
          consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.
        </p>
      </>
    ),
  },
  {
    id: 'changes-to-terms',
    heading: '10. Changes to Terms',
    body: (
      <>
        <p>
          We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least
          30 days notice prior to any new terms taking effect.
        </p>
      </>
    ),
  },
  {
    id: 'contact-information',
    heading: '11. Contact Information',
    body: (
      <>
        <p>
          If you have any questions about these Terms of Service, please contact us through the Service.
        </p>
      </>
    ),
  },
]
