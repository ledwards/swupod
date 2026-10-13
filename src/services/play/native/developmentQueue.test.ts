import {test} from 'node:test'
import assert from 'node:assert/strict'
import {developmentQueueSeat} from './developmentQueue'
const seat='0d2f377e-9310-4e23-a023-af56c7e78915'
const env={NODE_ENV:'development',PTP_PUBLIC_ORIGIN:'http://localhost:3000',PURRGIL_PUBLIC_ORIGIN:'http://localhost:8080'} as NodeJS.ProcessEnv
const admin={username:'terronk',is_admin:true}
test('only terronk admin on local development may use independent queue seats',()=>{
 assert.equal(developmentQueueSeat(admin,seat,env),seat)
 for(const user of [null,{username:'terronk',is_admin:false},{username:'someone',is_admin:true}])assert.equal(developmentQueueSeat(user,seat,env),undefined)
 for(const NODE_ENV of ['production','test',undefined])assert.equal(developmentQueueSeat(admin,seat,{...env,NODE_ENV}),undefined)
 for(const key of ['PTP_PUBLIC_ORIGIN','PURRGIL_PUBLIC_ORIGIN'])assert.equal(developmentQueueSeat(admin,seat,{...env,[key]:'https://protectthepod.com'}),undefined)
 assert.equal(developmentQueueSeat(admin,'arbitrary',env),undefined)
})
