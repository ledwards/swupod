import pg from 'pg'

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_PUBLIC_URL,
    ssl: { rejectUnauthorized: false }
  })

  const matches = await pool.query(`
    SELECT
      pm.id,
      pm.wayfinder_match_id,
      pm.game1_result, pm.game2_result, pm.game3_result,
      pm.match_winner, pm.final_confirmed,
      u1.username AS player1,
      u2.username AS player2
    FROM practice_matches pm
    LEFT JOIN users u1 ON u1.id = pm.player1_id
    LEFT JOIN users u2 ON u2.id = pm.player2_id
    WHERE pm.wayfinder_match_id IS NOT NULL
    ORDER BY pm.id DESC
    LIMIT 10
  `)
  console.log('=== PRACTICE MATCHES WITH WAYFINDER DATA ===')
  console.log(JSON.stringify(matches.rows, null, 2))

  const recentPools = await pool.query(`
    SELECT cp.share_id, u.username, cp.wins, cp.losses, cp.draws,
           cp.wayfinder_match_ids, cp.updated_at
    FROM card_pools cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.updated_at > NOW() - INTERVAL '2 hours'
    ORDER BY cp.updated_at DESC
    LIMIT 10
  `)
  console.log('=== RECENTLY UPDATED POOLS ===')
  console.log(JSON.stringify(recentPools.rows, null, 2))

  await pool.end()
}

main().catch(console.error)
