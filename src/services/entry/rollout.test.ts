import {test} from 'node:test'
import assert from 'node:assert/strict'
import {betaExperienceEnabled,soloAiEnabled} from './rollout'
test('beta rollout fails closed; AI needs all three explicit switches',()=>{
 for(const env of [{},{PTP_BETA_EXPERIENCE_ENABLED:'false'},{PTP_BETA_EXPERIENCE_ENABLED:'1'}])assert.equal(betaExperienceEnabled(env),false)
 for(const NODE_ENV of ['development','production']){
  const env={NODE_ENV,PTP_BETA_EXPERIENCE_ENABLED:'true',PTP_NATIVE_PLAY_ENABLED:'true',PTP_SOLO_AI_ENABLED:'true'}
  assert.equal(betaExperienceEnabled(env),true);assert.equal(soloAiEnabled(env),true)
  for(const key of ['PTP_BETA_EXPERIENCE_ENABLED','PTP_NATIVE_PLAY_ENABLED','PTP_SOLO_AI_ENABLED'])assert.equal(soloAiEnabled({...env,[key]:'false'}),false)
 }
})
