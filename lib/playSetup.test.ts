import {test} from 'node:test'
import assert from 'node:assert/strict'
import {playSetupPath} from './playSetup'

test('play deep links open the homepage Play setup preselected', () => {
  assert.equal(playSetupPath({}), '/lobby/constructed')
  assert.equal(playSetupPath({format: 'eternal'}), '/lobby/constructed?format=eternal')
  assert.equal(playSetupPath({format: 'premier'}), '/lobby/constructed?format=premier')
  assert.equal(playSetupPath({limited: 'draft', set: 'sor'}), '/lobby/constructed?format=draft&set=SOR')
  assert.equal(playSetupPath({limited: 'six', set: 'HMW'}), '/lobby/constructed?format=sealed&set=HMW')
  assert.equal(playSetupPath({limited: 'eight', set: 'HMW'}), '/lobby/constructed?format=sealed&limited=eight&set=HMW')
  assert.equal(playSetupPath({format: 'limited', limited: 'chaos'}), '/lobby/constructed?format=sealed&limited=chaos')
  assert.equal(playSetupPath({pool: 'abc 123', format: 'eternal'}), '/lobby?pool=abc+123')
  assert.equal(playSetupPath(new URLSearchParams('invite=tok&pool=x')), '/lobby?invite=tok')
  assert.equal(playSetupPath({set: '../x', limited: 'draft'}), '/lobby/constructed?format=draft')
  assert.equal(playSetupPath({format: ['eternal', 'premier']}), '/lobby/constructed?format=eternal')
})
