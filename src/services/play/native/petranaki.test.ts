import test from 'node:test'
import assert from 'node:assert/strict'
import { launchPetranakiPractice } from './petranaki'
const env={PTP_BETA_EXPERIENCE_ENABLED:'true',PTP_NATIVE_PLAY_ENABLED:'true',PTP_PETRANAKI_ENABLED:'true',BAIZE_PVP_URL:'http://baize',BAIZE_PVP_SERVICE_KEY:'baize-secret',PURRGIL_INTERNAL_URL:'http://purrgil',PURRGIL_HOST_SERVICE_KEY:'host-secret',PURRGIL_PUBLIC_ORIGIN:'https://play.example.com',PTP_PUBLIC_ORIGIN:'https://ptp.example.com',PTP_NATIVE_INVITE_KEY:'invite',PTP_NATIVE_SUPPORT_PATH:'support.json'}
test('trusted analysis launch preserves retry identity and never invokes the competitive runtime',async()=>{
 const calls:unknown[]=[]
 const fetchImpl:typeof fetch=async(url,options)=>{calls.push([url,JSON.parse(options!.body as string)]);assert.equal((options!.headers as Record<string,string>).Authorization,'Bearer host-secret');return Response.json({engine:'petranaki',kind:'analysis',launchUrl:'https://play.example.com/petranaki/player/index.html#match=test&token=seat'})}
 const first=await launchPetranakiPractice('subject','request',env,fetchImpl,9999999999999)
 await launchPetranakiPractice('subject','request',env,fetchImpl,9999999999999)
 assert.equal(first.kind,'analysis');assert.deepEqual(calls[0],calls[1]);assert.equal((calls[0] as string[])[0],'http://purrgil/internal/petranaki/practice')
})
test('disabled admission does not call services and foreign launch/result types are rejected',async()=>{
 let calls=0
 await assert.rejects(()=>launchPetranakiPractice('s','r',{...env,PTP_PETRANAKI_ENABLED:'false'},async()=>{calls++;return Response.json({})}));assert.equal(calls,0)
 for(const value of [{engine:'baize',kind:'analysis'},{engine:'petranaki',kind:'competitive'},{engine:'petranaki',kind:'analysis',launchUrl:'https://evil.example/petranaki/player/index.html#token=secret'}])await assert.rejects(()=>launchPetranakiPractice('s','r',env,async()=>Response.json(value)))
})
