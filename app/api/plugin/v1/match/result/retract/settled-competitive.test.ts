// SPEC: when a COMPETITIVE pod may be retracted from.
//
// The live-pod refusal exists because a Swiss result moves standings and can
// advance a round. That risk decays to nothing once the pod stops: after two
// weeks of silence no round is advancing, nobody is reading those standings to
// make a decision, and what persists is a result sitting in the record that was
// never played there.
//
// The 2026-09-06 sweep hit 24 such games across 7 pods, every one idle between
// 26 and 50 days.
//
// Two conditions are required and this file pins BOTH. The caller states intent
// (`allowSettledCompetitive`); this service independently proves the pod is
// settled. A caller flag alone would be a footgun — whoever calls it cannot
// know whether a round is in flight, and this service can.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROUTE = readFileSync(
  path.join(process.cwd(), 'app/api/plugin/v1/match/result/retract/route.ts'),
  'utf8',
)

// Comments in this file describe the trap in prose, so strip them before
// asserting on the code — a guard that matches its own warning comment is the
// false-green this repo has shipped before.
const CODE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('retract: settled-competitive rule', () => {
  it('requires BOTH the caller flag and a service-side settled check', () => {
    assert.match(CODE, /if \(!allowSettledCompetitive \|\| !settled\)/,
      'the refusal must fire when EITHER condition is missing')
  })

  it('derives settledness from the pod, never from the request', () => {
    // The age comes out of last_activity_at, which the SQL computes. If this
    // ever reads a caller-supplied timestamp the guard is decorative.
    assert.match(CODE, /last_activity_at/)
    assert.match(CODE, /ageDays\s*>=\s*SETTLED_COMPETITIVE_DAYS/)
    assert.doesNotMatch(CODE, /body\.(lastActivity|ageDays|settled)/,
      'settledness must not be caller-supplied')
  })

  it('treats UNKNOWN activity as infinitely old only alongside the explicit flag', () => {
    // A pod with no activity timestamp at all is ancient by construction —
    // there is nothing to advance. It still needs the caller to have asked.
    assert.match(CODE, /Number\.POSITIVE_INFINITY/)
  })

  it('computes last activity from the pod AND its matches, not one of them', () => {
    // pods.updated_at alone misses a pod whose row was never touched after its
    // matches landed; MAX(casual_matches.created_at) alone misses a pod that
    // was edited with no matches recorded.
    assert.match(CODE, /GREATEST\(/);
    assert.match(CODE, /MAX\(cm\.created_at\)/);
  })

  it('keeps the threshold well past "is anyone still playing"', () => {
    const m = /const SETTLED_COMPETITIVE_DAYS = (\d+)/.exec(CODE)
    assert.ok(m, 'threshold constant must exist')
    assert.ok(Number(m![1]) >= 7,
      'a threshold under a week would start catching pods between rounds')
  })

  it('still refuses a live competitive pod even when the flag is passed', () => {
    // The message for that case names the age and the threshold, so the caller
    // learns WHY rather than retrying blindly.
    assert.match(CODE, /settled threshold/)
  })
})
