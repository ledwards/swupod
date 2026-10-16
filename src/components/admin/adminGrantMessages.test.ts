// Spec: the alpha Grant Access panel confirms a grant with the same sentences
// the legacy panel uses (src/components/admin/AdminGrantPanel.tsx), for every
// flag, with and without pre-provisioning.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { grantSuccessMessage } from './adminGrantMessages'

const user = { username: 'Kestrel', discord_id: '418302957716340736' }

describe('grantSuccessMessage', () => {
  it('patron grant to an existing user', () => {
    assert.equal(
      grantSuccessMessage({ user, preProvisioned: false, flag: 'is_patron' }),
      'Granted patron access to Kestrel (418302957716340736).'
    )
  })

  it('patron grant to a pre-provisioned user', () => {
    assert.equal(
      grantSuccessMessage({ user, preProvisioned: true, flag: 'is_patron' }),
      'Pre-provisioned new user with Discord ID 418302957716340736 and granted patron access. They will see patron features on first sign-in.'
    )
  })

  it('beta grant to an existing user', () => {
    assert.equal(
      grantSuccessMessage({ user, preProvisioned: false, flag: 'is_beta_tester' }),
      'Granted beta access to Kestrel (418302957716340736). Tell them to sign out and back in to see beta features immediately.'
    )
  })

  it('beta grant to a pre-provisioned user', () => {
    assert.equal(
      grantSuccessMessage({ user, preProvisioned: true, flag: 'is_beta_tester' }),
      'Pre-provisioned new user with Discord ID 418302957716340736 and granted beta access. They will see beta features on first sign-in.'
    )
  })

  it('alpha grant names both alpha and beta, either way', () => {
    assert.equal(
      grantSuccessMessage({ user, preProvisioned: false, flag: 'is_alpha_tester' }),
      'Granted alpha and beta access to Kestrel (418302957716340736). Refresh the session or sign in again to activate it.'
    )
    assert.equal(
      grantSuccessMessage({ user, preProvisioned: true, flag: 'is_alpha_tester' }),
      'Granted alpha and beta access to Kestrel (418302957716340736). Access is ready for their first sign-in.'
    )
  })
})
