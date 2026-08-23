/**
 * Friends of the Pod (Patreon supporter) features — SINGLE SOURCE OF TRUTH.
 *
 * Every surface that enumerates patron perks reads this list:
 *   - src/components/PatreonFeaturesBox.tsx  (gold "Special Features" expander
 *     on the Support the Pod page, via About.tsx)
 *   - src/components/SubscribeModal.tsx       (conversion-modal benefits list)
 *
 * RULE: whenever you add, remove, or rename a Friends-of-the-Pod / patron-gated
 * feature anywhere in the app, update this array in the same change. See
 * .claude/rules/patreon-features.md. Do not hard-code perk lists in components.
 *
 * Order here is the order shown to users — lead with the strongest hooks.
 */

export interface PatreonFeature {
  /** Stable kebab-case key. */
  id: string
  /** Short feature name, shown in bold. */
  title: string
  /** One-line, benefit-led description (marketing copy). */
  description: string
}

export const PATREON_FEATURES: PatreonFeature[] = [
  {
    id: 'early-set-access',
    title: 'Early Set Access',
    description:
      'Draft, build, and play every new set the moment spoilers land — weeks before it releases to everyone else.',
  },
  {
    id: 'competitive-draft-mode',
    title: 'Competitive Draft & Sealed',
    description:
      "Practice like it's a real event: official Appendix C pick timers for draft, 8-pack Competitive Sealed with a timed deck build, and best-of-three Swiss matchmaking that pairs your pod into rounds.",
  },
  {
    id: 'privileged-observer',
    title: 'Privileged Observer',
    description:
      'Share a public, no-login link to your live draft as a full-screen slideshow that follows along every pick — built for teams, friends, streaming and broadcasts.',
  },
  {
    id: 'draft-reports',
    title: 'Draft Reports',
    description:
      'Revisit every draft with a pick-by-pick log of what you saw and took, full pool and deck breakdowns, your match results, and private notes — plus a fit-to-screen Slideshow Mode.',
  },
  {
    id: 'import-pool',
    title: 'Import Pool',
    description:
      'Snap a photo of your sealed registration sheet and import the whole pool into the deckbuilder in seconds — no manual entry.',
  },
  {
    id: 'professional-stats',
    title: 'Professional Stats',
    description:
      'Dig into draft and sealed performance data from the top limited players — archetypes, win rates, and pick trends.',
  },
  {
    id: 'gc-black-pack',
    title: 'GC Black Pack',
    description:
      'Unlock and open the exclusive Galactic Championship 2026 Black Pack — alt-art event promos reserved for Friends of the Pod, on top of the Silver Pack anyone can claim.',
  },
  {
    id: 'every-voice-pack',
    title: 'Every Voice Pack',
    description:
      'Every creator voice pack on the platform, Leebo included, without redeeming a single code — your draft calls, in whoever you like. Everyone gets the language packs; the rest are yours.',
  },
  {
    id: 'avatar-flair',
    title: 'Avatar Flair',
    description:
      "A gold frame on your avatar across the site so everyone knows you're a Friend of the Pod.",
  },
  {
    id: 'beta-access',
    title: 'Beta Access',
    description:
      'Get early access to new features and pre-release sets before anyone else as an exclusive beta tester.',
  },
  {
    id: 'discord-access',
    title: 'Discord Access',
    description:
      'Link Discord on Patreon to unlock your Friend of the Pod role and the supporters-only channels with the dev team.',
  },
  {
    id: 'support-the-pod',
    title: 'Support the Pod',
    description:
      'Earn the eternal gratitude of the community — and help keep the servers running — for supporting the pod!',
  },
]

export default PATREON_FEATURES
