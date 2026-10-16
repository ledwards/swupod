import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { importStep } from './wizardSteps'

// Spec (Import Pool wizard): Upload covers picking and importing photos (and an import error);
// Review is resolving; Confirm covers confirming, submitting and done.
describe('importStep', () => {
  it('maps every phase to its step', () => {
    const steps = ['idle', 'uploading', 'extracting', 'error', 'resolving', 'confirming', 'submitting', 'done'].map(importStep)
    assert.deepEqual(steps, ['upload', 'upload', 'upload', 'upload', 'resolve', 'confirm', 'confirm', 'confirm'])
  })
})
