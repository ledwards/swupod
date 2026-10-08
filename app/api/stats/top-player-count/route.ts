import { NextResponse } from 'next/server'
import { queryRow } from '@/lib/db'

export async function GET() {
  const row = await queryRow('SELECT COUNT(*) as count FROM top_players WHERE user_id IS NOT NULL')
  return NextResponse.json({ count: Number(row?.count || 0) })
}
