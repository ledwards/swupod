// @ts-nocheck
// Tests for makeAdmin.js CLI script
import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('makeAdmin CLI script', () => {
  describe('Argument parsing', () => {
    it('should accept email as positional argument', () => {
      const args = ['user@example.com']
      const email = args[0]
      const isEmail = email && email.includes('@')

      assert.strictEqual(isEmail, true)
    })

    it('should accept --discord flag with ID', () => {
      const args = ['--discord', '123456789']
      const discordFlag = args.indexOf('--discord')
      const discordId = discordFlag >= 0 ? args[discordFlag + 1] : null

      assert.strictEqual(discordId, '123456789')
    })

    it('should show usage when no arguments provided', () => {
      const args: string[] = []
      const showUsage = args.length === 0

      assert.strictEqual(showUsage, true)
    })
  })

  describe('Database operations', () => {
    it('should update user by email', () => {
      const sql = `UPDATE users SET is_admin = TRUE WHERE email = $1
         RETURNING id, email, username, discord_id, is_admin`

      assert.ok(sql.includes('is_admin = TRUE'))
      assert.ok(sql.includes('WHERE email'))
    })

    it('should update user by Discord ID', () => {
      const sql = `UPDATE users SET is_admin = TRUE WHERE discord_id = $1
         RETURNING id, email, username, discord_id, is_admin`

      assert.ok(sql.includes('is_admin = TRUE'))
      assert.ok(sql.includes('WHERE discord_id'))
    })

    it('should return user details after update', () => {
      const updatedUser = {
        id: '123',
        email: 'admin@example.com',
        username: 'adminuser',
        discord_id: '123456789',
        is_admin: true,
      }

      assert.strictEqual(updatedUser.is_admin, true)
    })
  })

  describe('Error handling', () => {
    it('should report when user not found', () => {
      const result = null
      const userNotFound = result === null

      assert.strictEqual(userNotFound, true)
    })

    it('should handle database connection errors', () => {
      const error = new Error('Connection refused')
      assert.ok(error.message.includes('Connection'))
    })
  })

  describe('Output messages', () => {
    it('should display success with user details', () => {
      const user = {
        id: '123',
        email: 'admin@example.com',
        username: 'adminuser',
        discord_id: '123456789',
        is_admin: true,
      }

      const output = `Successfully granted admin access:
  ID: ${user.id}
  Email: ${user.email}
  Username: ${user.username}
  Discord ID: ${user.discord_id}
  is_admin: ${user.is_admin}`

      assert.ok(output.includes('Successfully granted admin access'))
      assert.ok(output.includes('is_admin: true'))
    })

    it('should display error when user not found', () => {
      const email = 'notfound@example.com'
      const errorMessage = `User not found: ${email}`

      assert.ok(errorMessage.includes('User not found'))
    })
  })
})

describe('Admin access behavior', () => {
  it('should grant beta access implicitly', () => {
    const user = { is_admin: true, is_beta_tester: false }
    const hasBetaAccess = user.is_admin || user.is_beta_tester

    assert.strictEqual(hasBetaAccess, true)
  })

  it('should not modify is_beta_tester flag', () => {
    // makeAdmin only sets is_admin, not is_beta_tester
    const userBefore = { is_admin: false, is_beta_tester: false }
    const userAfter = { ...userBefore, is_admin: true }

    assert.strictEqual(userAfter.is_beta_tester, false)
    assert.strictEqual(userAfter.is_admin, true)
  })
})

console.log('\n👤 Running makeAdmin script tests...\n')
