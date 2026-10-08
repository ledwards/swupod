import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
test('alpha migration is additive, idempotent, beta-compatible and invalidates stale privileges',{skip:process.env.NATIVE_LOCAL_DB_TEST!=='1'},async()=>{
 const name=`ptp_alpha_${randomUUID().replaceAll('-','')}`,admin=new pg.Client({host:'/tmp',database:'postgres'});await admin.connect();await admin.query(`CREATE DATABASE ${name}`)
 const db=new pg.Client({host:'/tmp',database:name});await db.connect()
 try{
  await db.query('CREATE TABLE users(id INT PRIMARY KEY,is_beta_tester BOOLEAN DEFAULT FALSE,is_patron BOOLEAN DEFAULT FALSE,is_admin BOOLEAN DEFAULT FALSE,auth_version INT NOT NULL DEFAULT 1); INSERT INTO users(id,is_beta_tester,is_patron) VALUES(1,true,true),(2,false,false)')
  const sql=await readFile(new URL('../migrations/110_alpha_testers.sql',import.meta.url),'utf8');await db.query(sql);await db.query(sql)
  assert.equal((await db.query('SELECT is_alpha_tester FROM users WHERE id=1')).rows[0].is_alpha_tester,false)
  await db.query('UPDATE users SET is_alpha_tester=true WHERE id=2')
  assert.deepEqual((await db.query('SELECT is_alpha_tester,is_beta_tester,auth_version,is_patron FROM users WHERE id=2')).rows[0],{is_alpha_tester:true,is_beta_tester:true,auth_version:2,is_patron:false})
  await db.query('UPDATE users SET is_beta_tester=false WHERE id=2');assert.equal((await db.query('SELECT is_beta_tester FROM users WHERE id=2')).rows[0].is_beta_tester,true)
  await db.query('UPDATE users SET is_alpha_tester=true WHERE id=2');assert.equal((await db.query('SELECT auth_version FROM users WHERE id=2')).rows[0].auth_version,2)
  await db.query('UPDATE users SET is_alpha_tester=false WHERE id=2');assert.equal((await db.query('SELECT auth_version FROM users WHERE id=2')).rows[0].auth_version,3)
  assert.equal((await db.query('SELECT is_patron FROM users WHERE id=1')).rows[0].is_patron,true)
 }finally{await db.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end()}
})
