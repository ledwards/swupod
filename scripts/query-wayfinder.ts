import pg from 'pg'

async function main() {
  const connectionString = process.env.WAYFINDER_DATABASE_URL
  if (!connectionString) {
    console.error('WAYFINDER_DATABASE_URL not set. Add it to .env.local (Railway → wayfinder DB → DATABASE_PUBLIC_URL).')
    process.exit(1)
  }
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  const games = await pool.query(`
    SELECT
      g.game_id, g.played_at, g.source, g.format,
      g.player1_name, g.player2_name,
      g.player1_leader, g.player1_base,
      g.player2_leader, g.player2_base,
      g.winner, g.result,
      g.team_id, g.owner_membership_id,
      g.karabast_lobby_id,
      gc.captured_at, gc.user_id, gc.visibility
    FROM games g
    JOIN game_captures gc ON gc.game_id = g.game_id
    ORDER BY gc.captured_at DESC
    LIMIT 5
  `)
  console.log('=== RECENT CAPTURED GAMES ===')
  console.log(JSON.stringify(games.rows, null, 2))

  // Check game_pool_links
  const linkCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'game_pool_links' ORDER BY ordinal_position
  `)
  console.log('game_pool_links columns:', linkCols.rows.map((r: any) => r.column_name).join(', '))

  await pool.end()
}

main().catch(console.error)
