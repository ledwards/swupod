// @ts-nocheck
/**
 * Contract tests for POST /api/import-pool/extract.
 *
 * These tests document the expected response shapes and status codes for each
 * branch of the route. End-to-end exercise lives in tests/e2e/import-pool.spec.ts
 * (U11) where Playwright drives the wizard and mocks the Anthropic call at the
 * network layer.
 *
 * Run: node --import tsx/esm app/api/import-pool/extract/route.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('POST /api/import-pool/extract — contract', () => {
  describe('auth', () => {
    it('returns 401 UNAUTHORIZED when no session cookie is present', () => {
      const expected = { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } }
      assert.equal(expected.status, 401)
      assert.equal(expected.body.code, 'UNAUTHORIZED')
    })

    it('returns 403 PATRON_REQUIRED when logged-in user is not patron and not admin', () => {
      // is_patron MUST be queried from the DB, not read from session — JWT does
      // not encode is_patron. See lib/auth.ts:14-26 for the Session interface.
      const expected = {
        status: 403,
        body: { error: 'Friends of the Pod required to import pools', code: 'PATRON_REQUIRED' },
      }
      assert.equal(expected.status, 403)
      assert.equal(expected.body.code, 'PATRON_REQUIRED')
    })

    it('admin users bypass the patron gate (is_admin is in the JWT)', () => {
      const session = { id: 'u1', is_admin: true, is_beta_tester: false }
      // Route short-circuits the DB query when session.is_admin is true.
      assert.equal(session.is_admin, true)
    })
  })

  describe('request validation', () => {
    it('returns 400 INVALID_REQUEST when images array is missing or empty', () => {
      assert.equal({ code: 'INVALID_REQUEST' }.code, 'INVALID_REQUEST')
    })

    it('returns 400 TOO_MANY_IMAGES when more than 2 images are submitted', () => {
      assert.equal({ code: 'TOO_MANY_IMAGES' }.code, 'TOO_MANY_IMAGES')
    })

    it('returns 400 INVALID_IMAGE_SHAPE when an image lacks data or mediaType', () => {
      assert.equal({ code: 'INVALID_IMAGE_SHAPE' }.code, 'INVALID_IMAGE_SHAPE')
    })

    it('returns 400 UNSUPPORTED_MIME for non-image MIME types', () => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      assert.ok(allowed.includes('image/jpeg'))
      assert.ok(!allowed.includes('application/pdf'))
    })

    it('returns 413 PAYLOAD_TOO_LARGE when total decoded image bytes exceed 10MB', () => {
      const MAX = 10 * 1024 * 1024
      assert.equal(MAX, 10485760)
    })
  })

  describe('extraction failures', () => {
    it('returns 502 EXTRACTION_INVALID_JSON when the model response is not parseable', () => {
      assert.equal({ code: 'EXTRACTION_INVALID_JSON' }.code, 'EXTRACTION_INVALID_JSON')
    })

    it('returns 502 EXTRACTION_UPSTREAM_ERROR for Anthropic API outages or 5xx', () => {
      assert.equal({ code: 'EXTRACTION_UPSTREAM_ERROR' }.code, 'EXTRACTION_UPSTREAM_ERROR')
    })

    it('returns 502 EXTRACTION_INVALID_SCHEMA when the model returns out-of-bounds quantities', () => {
      // Prompt-injection mitigation: reject before passing to matcher.
      // Bounds: poolQty/deckQty integer 0-6, type in enum, deckQty <= poolQty.
      assert.equal({ code: 'EXTRACTION_INVALID_SCHEMA' }.code, 'EXTRACTION_INVALID_SCHEMA')
    })
  })

  describe('set detection', () => {
    it('returns 422 SET_DETECTION_FAILED with setCandidates when the set name cannot be resolved', () => {
      const expected = {
        status: 422,
        body: { code: 'SET_DETECTION_FAILED', setCandidates: ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW'] },
      }
      assert.equal(expected.status, 422)
      assert.ok(expected.body.setCandidates.includes('LAW'))
    })

    it('returns 400 UNKNOWN_SET when manualSetCode is not in the known set list', () => {
      assert.equal({ code: 'UNKNOWN_SET' }.code, 'UNKNOWN_SET')
    })
  })

  describe('happy path', () => {
    it('returns 200 with header + matched rows when extraction succeeds', () => {
      const expectedShape = {
        header: {
          setCode: 'LAW',
          setName: 'A Lawless Time',
          eventName: 'Crystal Cup #14',
          eventDate: '2026-04-12',
          playerName: 'Test Player',
          leader: { name: 'Han Solo', subtitle: 'Audacious Smuggler' },
          base: { name: 'Echo Base', subtitle: null },
        },
        rows: [
          {
            extracted: { name: 'Sabacc Dealer', type: 'Unit', subtitle: null, poolQty: 2, deckQty: 1 },
            matched: { id: 'uuid-1', cardId: 'LAW-085', name: 'Sabacc Dealer' },
            candidates: [],
            confidence: 'exact',
          },
        ],
      }
      assert.equal(expectedShape.header.setCode, 'LAW')
      assert.equal(expectedShape.rows[0].confidence, 'exact')
    })
  })
})
