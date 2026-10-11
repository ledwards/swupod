import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLocalDatabaseUrl } from './seed-pod-flows'

test('the pod-flow seed only runs against a database on this machine', () => {
  assert.ok(isLocalDatabaseUrl('postgresql://lee@localhost:5432/protectthepod'))
  assert.ok(isLocalDatabaseUrl('postgres://lee@127.0.0.1/protectthepod'))
  assert.ok(isLocalDatabaseUrl('postgresql:///protectthepod?host=/tmp'))
  assert.ok(!isLocalDatabaseUrl(undefined))
  assert.ok(!isLocalDatabaseUrl('postgresql://u:p@db.railway.internal:5432/railway'))
  assert.ok(!isLocalDatabaseUrl('postgresql://u:p@roundhouse.proxy.rlwy.net:41234/railway?sslmode=require'))
  assert.ok(!isLocalDatabaseUrl('postgresql://u@localhost.evil.com/x'))
  assert.ok(!isLocalDatabaseUrl('postgresql://u@remote/x?host=db.example.com'))
  assert.ok(!isLocalDatabaseUrl('mysql://localhost/x'))
})
