import dotenv from "dotenv";
dotenv.config();
import pg from "pg";

const c = new pg.Client(process.env.POSTGRES_URL);
await c.connect();

const baseline = await c.query("SELECT count(*) AS total, count(*) FILTER (WHERE wayfinder_replay_url IS NOT NULL) AS with_replay, count(*) FILTER (WHERE wayfinder_match_id IS NOT NULL) AS with_match_id FROM practice_matches");
console.log(`baseline: ${JSON.stringify(baseline.rows[0])}`);
const seen = new Set();
const initial = await c.query("SELECT id FROM practice_matches");
initial.rows.forEach(r => seen.add(r.id));
console.log(`watching ${seen.size} existing rows + new rows... (Ctrl-C to stop)`);

while (true) {
  const r = await c.query("SELECT id, round_id, pod_id, match_winner, wayfinder_match_id, wayfinder_replay_url, created_at FROM practice_matches ORDER BY created_at DESC");
  for (const row of r.rows) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      console.log(`[NEW ROW] ${new Date().toISOString()} ${JSON.stringify(row)}`);
    }
  }
  const upd = await c.query("SELECT id, wayfinder_match_id, wayfinder_replay_url FROM practice_matches WHERE wayfinder_match_id IS NOT NULL OR wayfinder_replay_url IS NOT NULL");
  for (const row of upd.rows) {
    const key = `${row.id}|${row.wayfinder_match_id}|${row.wayfinder_replay_url}`;
    if (!seen.has(key)) {
      seen.add(key);
      console.log(`[WF DATA] ${new Date().toISOString()} ${JSON.stringify(row)}`);
    }
  }
  await new Promise(r => setTimeout(r, 3000));
}
