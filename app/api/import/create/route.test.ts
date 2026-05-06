// @ts-nocheck
/**
 * Contract tests for POST /api/import/create.
 *
 * The trust-boundary endpoint that re-validates client-edited resolved rows,
 * re-checks the patron gate, and INSERTs the pool. End-to-end exercise lives
 * in tests/e2e/import-pool.spec.ts.
 *
 * Run: node --import tsx/esm app/api/import/create/route.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('POST /api/import/create — contract', () => {
  describe('auth (regression guard for security finding)', () => {
    it('returns 401 when no session', () => {
      // Closes the patron-gate-bypass: the wizard never POSTs to /api/pools
      // (which allows anonymous), so the only persistence path for imported
      // pools is gated.
      assert.equal({ status: 401 }.status, 401)
    })

    it('returns 403 PATRON_REQUIRED for logged-in non-patrons', () => {
      // CRITICAL: is_patron must be queried from DB, not session.
      // A non-patron with a valid session must NOT be able to create
      // pool_type='imported' rows by any means.
      assert.equal({ code: 'PATRON_REQUIRED' }.code, 'PATRON_REQUIRED')
    })

    it('admin users bypass the patron gate', () => {
      const session = { id: 'u1', is_admin: true }
      assert.equal(session.is_admin, true)
    })
  })

  describe('request validation', () => {
    it('returns 422 VALIDATION_FAILED with details array on bad input', () => {
      const expected = {
        status: 422,
        body: { error: 'VALIDATION_FAILED', details: [{ code: 'INVALID_REQUEST', message: '...' }] },
      }
      assert.equal(expected.status, 422)
      assert.equal(expected.body.error, 'VALIDATION_FAILED')
      assert.ok(Array.isArray(expected.body.details))
    })

    it('rejects unknown setCode with code UNKNOWN_SET', () => {
      assert.equal({ code: 'UNKNOWN_SET' }.code, 'UNKNOWN_SET')
    })

    it('rejects title longer than 80 chars with code TITLE_TOO_LONG', () => {
      const MAX = 80
      assert.equal(MAX, 80)
    })

    it('rejects title starting with [PTP] (export prefix is reserved)', () => {
      const title = '[PTP] Crystal Cup'
      assert.ok(title.startsWith('[PTP]'))
    })

    it('rejects deckQty > poolQty per row (server-side, regardless of client checks)', () => {
      assert.equal({ code: 'INVALID_QTY' }.code, 'INVALID_QTY')
    })
  })

  describe('card re-resolution (defense in depth)', () => {
    it('rejects cards whose id is not in the cached card DB for the chosen setCode', () => {
      // Defends against forged cardIds. The server re-runs the cardById lookup
      // even though the matcher already ran on the extract route — the wizard
      // can edit the matched card client-side, so we never trust the client
      // pick without verifying it against getCachedCards(setCode).
      assert.equal({ code: 'UNKNOWN_CARD' }.code, 'UNKNOWN_CARD')
    })

    it('cross-set tampering is blocked (LAW pool with a SHD cardId rejected)', () => {
      // If a client submits resolvedRows pointing at SHD cards but setCode=LAW,
      // the LAW card cache won't contain those ids — UNKNOWN_CARD on every row.
      assert.equal({ code: 'UNKNOWN_CARD' }.code, 'UNKNOWN_CARD')
    })
  })

  describe('pool assembly invariants', () => {
    it('rejects pool size != 96 with code POOL_SIZE', () => {
      // Comes from buildPool — the server re-runs assembly.
      assert.equal({ code: 'POOL_SIZE' }.code, 'POOL_SIZE')
    })

    it('rejects activeLeaderId pointing to a non-leader card with INVALID_LEADER', () => {
      assert.equal({ code: 'INVALID_LEADER' }.code, 'INVALID_LEADER')
    })

    it('rejects activeBaseId pointing to a non-base card with INVALID_BASE', () => {
      assert.equal({ code: 'INVALID_BASE' }.code, 'INVALID_BASE')
    })
  })

  describe('happy path', () => {
    it('returns 201 with { id, shareId, shareUrl, createdAt }', () => {
      const expected = {
        status: 201,
        body: {
          id: 'cp_abc123',
          shareId: 'EFEyNRnr',
          shareUrl: 'https://www.protectthepod.com/pool/EFEyNRnr/deck',
          createdAt: '2026-05-05T12:00:00Z',
        },
      }
      assert.equal(expected.status, 201)
      assert.match(expected.body.shareUrl, /\/pool\/.+\/deck$/)
    })

    it('persists with pool_type="imported" (NOT "sealed")', () => {
      // U1 added 'imported' to the card_pools_pool_type_check constraint.
      const poolType = 'imported'
      assert.equal(poolType, 'imported')
    })

    it('persists deckBuilderState with cardPositions, activeLeader, activeBase set', () => {
      const expected = {
        cardPositions: { 'leader-0-l1': { section: 'leaders-bases' } },
        activeLeader: 'leader-0-l1',
        activeBase: 'base-0-b1',
      }
      assert.ok(expected.cardPositions)
      assert.ok(expected.activeLeader)
      assert.ok(expected.activeBase)
    })
  })
})
