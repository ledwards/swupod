import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  DISCORD_ID_BY_EMAIL_SQL,
  discordIdFromUserRow,
  getPatreonEntitlementAction,
  siteEntitlementUpdateSql,
} from './patreonEntitlements'

describe('Patreon webhook entitlement helpers', () => {
  it('classifies inactive member updates as revokes', () => {
    assert.equal(getPatreonEntitlementAction('members:pledge:update', null), 'revoke')
    assert.equal(getPatreonEntitlementAction('members:update', 'declined_patron'), 'revoke')
  })

  it('classifies active members and trials as grants', () => {
    assert.equal(getPatreonEntitlementAction('members:pledge:update', 'active_patron'), 'grant')
    assert.equal(getPatreonEntitlementAction('members:update', 'pay_upfront'), 'grant')
    assert.equal(getPatreonEntitlementAction('members:pledge:create', null), 'grant')
  })

  it('bumps auth_version when revoking site access by email or Discord ID', () => {
    const emailSql = siteEntitlementUpdateSql('revoke', 'email')
    assert.match(emailSql, /is_patron = FALSE/)
    assert.match(emailSql, /is_beta_tester = FALSE/)
    assert.match(emailSql, /auth_version = auth_version \+ 1/)
    assert.match(emailSql, /LOWER\(email\) = LOWER\(\$1\)/)

    const discordSql = siteEntitlementUpdateSql('revoke', 'discordId')
    assert.match(discordSql, /is_patron = FALSE/)
    assert.match(discordSql, /is_beta_tester = FALSE/)
    assert.match(discordSql, /auth_version = auth_version \+ 1/)
    assert.match(discordSql, /discord_id = \$1/)
  })

  it('defines a DB fallback for recovering Discord ID from Patreon email', () => {
    assert.match(DISCORD_ID_BY_EMAIL_SQL, /SELECT discord_id FROM users/)
    assert.match(DISCORD_ID_BY_EMAIL_SQL, /LOWER\(email\) = LOWER\(\$1\)/)
    assert.equal(discordIdFromUserRow({ discord_id: '123456789012345678' }), '123456789012345678')
    assert.equal(discordIdFromUserRow({ discord_id: null }), null)
    assert.equal(discordIdFromUserRow(null), null)
  })
})
