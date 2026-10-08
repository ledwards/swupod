// tests/e2e/competitive-bo3.spec.ts
// @ts-nocheck
// E2E tests for competitive Bo3 match reporting via the Wayfinder API.
// Validates per-game reporting, match auto-confirmation, card_pool updates,
// round advancement, the competitive flag on play metadata, and edge cases.
//
// Run: npm run test:e2e -- --grep "Competitive Bo3"
// Requires: PTP_SERVICE_KEY in .env.local, dev server running
import { test, expect } from "@playwright/test";
import pg from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createTestUser, cleanupTestUsers, closeDb } from "./test-utils.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../../.env.local") });
dotenv.config({ path: join(__dirname, "../../.env") });

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const TEST_ID = `e2e_bo3_${Date.now()}`;
const SERVICE_KEY = process.env.PTP_SERVICE_KEY;

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

async function getPool(): Promise<pg.Pool> {
  return new pg.Pool({ connectionString });
}

function uniqueId(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── DB Setup Helpers ────────────────────────────────────────────────────────

async function createCompetitivePod(
  db: pg.Pool,
  hostId: string,
  setCode = "SOR"
): Promise<{ podId: string; podShareId: string }> {
  const shareId = uniqueId("pod");
  const result = await db.query(
    `INSERT INTO pods (share_id, host_id, set_code, set_name, name, status,
      max_players, current_players, competitive, draft_state, state_version,
      box_packs, is_public)
     VALUES ($1, $2, $3, 'Spark of Rebellion', 'Test Competitive Bo3', 'complete',
      8, 2, true,
      $4::jsonb,
      1, '[]'::jsonb, false)
     RETURNING id`,
    [
      shareId,
      hostId,
      setCode,
      JSON.stringify({
        phase: "matchmaking",
        matchmakingStatus: "active",
        currentRound: 1,
      }),
    ]
  );
  return { podId: result.rows[0].id, podShareId: shareId };
}

async function addPlayerToPod(
  db: pg.Pool,
  podId: string,
  userId: string,
  seatNumber: number
): Promise<void> {
  await db.query(
    `INSERT INTO pod_players (pod_id, user_id, seat_number, is_bot)
     VALUES ($1, $2, $3, false)
     ON CONFLICT DO NOTHING`,
    [podId, userId, seatNumber]
  );
}

async function createPoolForPlayer(
  db: pg.Pool,
  userId: string,
  podId: string,
  setCode = "SOR"
): Promise<string> {
  const shareId = uniqueId("pool");
  await db.query(
    `INSERT INTO card_pools (share_id, pod_id, user_id, set_code, pool_type, cards,
      wins, losses, draws, wayfinder_match_ids, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'draft', '[]'::jsonb, 0, 0, 0, '{}', NOW(), NOW())`,
    [shareId, podId, userId, setCode]
  );
  return shareId;
}

async function createNonCompetitivePool(
  db: pg.Pool,
  userId: string,
  setCode = "SOR"
): Promise<string> {
  const shareId = uniqueId("ncpool");
  await db.query(
    `INSERT INTO card_pools (share_id, user_id, set_code, pool_type, cards,
      wins, losses, draws, wayfinder_match_ids, created_at, updated_at)
     VALUES ($1, $2, $3, 'sealed', '[]'::jsonb, 0, 0, 0, '{}', NOW(), NOW())`,
    [shareId, userId, setCode]
  );
  return shareId;
}

async function createActiveRound(
  db: pg.Pool,
  podId: string,
  roundNumber = 1
): Promise<string> {
  const result = await db.query(
    `INSERT INTO practice_rounds (pod_id, round_number, status, created_at)
     VALUES ($1, $2, 'active', NOW()) RETURNING id`,
    [podId, roundNumber]
  );
  return result.rows[0].id;
}

async function createPracticeMatch(
  db: pg.Pool,
  roundId: string,
  podId: string,
  player1Id: string,
  player2Id: string
): Promise<string> {
  const result = await db.query(
    `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye,
      final_confirmed, created_at)
     VALUES ($1, $2, $3, $4, false, false, NOW()) RETURNING id`,
    [roundId, podId, player1Id, player2Id]
  );
  return result.rows[0].id;
}

async function getMatch(db: pg.Pool, matchId: string) {
  const result = await db.query(
    `SELECT * FROM practice_matches WHERE id = $1`,
    [matchId]
  );
  return result.rows[0] || null;
}

async function getPool_(db: pg.Pool, shareId: string) {
  const result = await db.query(
    `SELECT * FROM card_pools WHERE share_id = $1`,
    [shareId]
  );
  return result.rows[0] || null;
}

async function getRound(db: pg.Pool, roundId: string) {
  const result = await db.query(
    `SELECT * FROM practice_rounds WHERE id = $1`,
    [roundId]
  );
  return result.rows[0] || null;
}

async function getRoundsByPod(db: pg.Pool, podId: string) {
  const result = await db.query(
    `SELECT * FROM practice_rounds WHERE pod_id = $1 ORDER BY round_number`,
    [podId]
  );
  return result.rows;
}

async function getMatchesForRound(db: pg.Pool, roundId: string) {
  const result = await db.query(
    `SELECT * FROM practice_matches WHERE round_id = $1 ORDER BY created_at`,
    [roundId]
  );
  return result.rows;
}

function headers(key: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

async function postMatchResult(
  poolShareId: string,
  result: string,
  matchId: string,
  gameNumber?: number
) {
  const body: any = { poolShareId, result, matchId };
  if (gameNumber !== undefined) body.gameNumber = gameNumber;
  const res = await fetch(`${BASE_URL}/api/plugin/v1/match/result`, {
    method: "POST",
    headers: headers(SERVICE_KEY!),
    body: JSON.stringify(body),
  });
  return res;
}

// ── Scaffold: create 2-player competitive pod with active match ─────────────

interface CompetitiveFixture {
  db: pg.Pool;
  player1: any;
  player2: any;
  podId: string;
  podShareId: string;
  pool1ShareId: string;
  pool2ShareId: string;
  roundId: string;
  matchId: string;
}

async function createCompetitiveFixture(): Promise<CompetitiveFixture> {
  const db = await getPool();

  const player1 = await createTestUser("Bo3P1", TEST_ID, { isBetaTester: true });
  const player2 = await createTestUser("Bo3P2", TEST_ID, { isBetaTester: true });

  const { podId, podShareId } = await createCompetitivePod(db, player1.user.id);

  await addPlayerToPod(db, podId, player1.user.id, 1);
  await addPlayerToPod(db, podId, player2.user.id, 5);

  const pool1ShareId = await createPoolForPlayer(db, player1.user.id, podId);
  const pool2ShareId = await createPoolForPlayer(db, player2.user.id, podId);

  const roundId = await createActiveRound(db, podId, 1);
  const matchId = await createPracticeMatch(
    db,
    roundId,
    podId,
    player1.user.id,
    player2.user.id
  );

  return {
    db,
    player1,
    player2,
    podId,
    podShareId,
    pool1ShareId,
    pool2ShareId,
    roundId,
    matchId,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

test.describe.configure({ mode: "serial" });
test.skip(
  ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
  "Skipped: Desktop Chromium only (long-running integration test)"
);
test.setTimeout(120_000);

// ── 1. Input Validation ─────────────────────────────────────────────────────

test.describe("Competitive Bo3 — Input Validation", () => {
  test("rejects gameNumber outside 1-3", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      const user = await createTestUser("ValP", TEST_ID);
      const shareId = await createNonCompetitivePool(db, user.user.id);

      const res = await postMatchResult(shareId, "win", "m-val-1", 4);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain("gameNumber");
    } finally {
      await db.end();
    }
  });

  test("rejects gameNumber 0", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      const user = await createTestUser("ValP0", TEST_ID);
      const shareId = await createNonCompetitivePool(db, user.user.id);

      const res = await postMatchResult(shareId, "win", "m-val-0", 0);
      expect(res.status).toBe(400);
    } finally {
      await db.end();
    }
  });

  test("accepts gameNumber 1, 2, and 3", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    // Non-competitive pool — gameNumber is accepted but falls through to
    // the non-competitive path which ignores it for card_pools.
    const db = await getPool();
    try {
      const user = await createTestUser("ValOK", TEST_ID);
      const shareId = await createNonCompetitivePool(db, user.user.id);

      for (const gn of [1, 2, 3]) {
        const res = await postMatchResult(shareId, "win", `m-ok-${gn}`, gn);
        expect(res.status).toBe(200);
      }
    } finally {
      await db.end();
    }
  });
});

// ── 2. Play Metadata — competitive flag ─────────────────────────────────────

test.describe("Competitive Bo3 — Play Metadata", () => {
  test("non-competitive pool returns competitive: false", async () => {
    const db = await getPool();
    try {
      const user = await createTestUser("MetaNC", TEST_ID);
      const shareId = await createNonCompetitivePool(db, user.user.id);

      const res = await fetch(
        `${BASE_URL}/api/plugin/v1/play/pool/${shareId}`
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.competitive).toBe(false);
    } finally {
      await db.end();
    }
  });

  test("competitive pool returns competitive: true", async () => {
    const db = await getPool();
    try {
      const user = await createTestUser("MetaC", TEST_ID, {
        isBetaTester: true,
      });
      const { podId } = await createCompetitivePod(db, user.user.id);
      await addPlayerToPod(db, podId, user.user.id, 1);
      const shareId = await createPoolForPlayer(db, user.user.id, podId);

      const res = await fetch(
        `${BASE_URL}/api/plugin/v1/play/pool/${shareId}`
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.competitive).toBe(true);
    } finally {
      await db.end();
    }
  });
});

// ── 3. Per-Game Reporting — 2-0 Sweep ───────────────────────────────────────

test.describe("Competitive Bo3 — 2-0 Sweep", () => {
  let f: CompetitiveFixture;

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    f = await createCompetitiveFixture();
  });

  test.afterAll(async () => {
    if (f?.db) await f.db.end();
  });

  test("game 1 fills game1_result, match NOT decided", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const res = await postMatchResult(
      f.pool1ShareId,
      "win",
      "wf-sweep-001",
      1
    );
    expect(res.status).toBe(200);

    const match = await getMatch(f.db, f.matchId);
    expect(match.game1_result).toBe("player1");
    expect(match.game2_result).toBeNull();
    expect(match.game3_result).toBeNull();
    expect(match.final_confirmed).toBe(false);
    expect(match.match_winner).toBeNull();
    expect(match.wayfinder_match_id).toBe("wf-sweep-001");
  });

  test("card_pools NOT updated after game 1 (competitive defers)", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const pool1 = await getPool_(f.db, f.pool1ShareId);
    expect(pool1.wins).toBe(0);
    expect(pool1.losses).toBe(0);
    expect(pool1.draws).toBe(0);
    expect(pool1.wayfinder_match_ids).toEqual([]);

    const pool2 = await getPool_(f.db, f.pool2ShareId);
    expect(pool2.wins).toBe(0);
    expect(pool2.losses).toBe(0);
  });

  test("game 2 fills game2_result, match auto-confirms as 2-0", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const res = await postMatchResult(
      f.pool1ShareId,
      "win",
      "wf-sweep-001",
      2
    );
    expect(res.status).toBe(200);

    const match = await getMatch(f.db, f.matchId);
    expect(match.game1_result).toBe("player1");
    expect(match.game2_result).toBe("player1");
    expect(match.game3_result).toBeNull();
    expect(match.final_confirmed).toBe(true);
    expect(match.match_winner).toBe("player1");
    expect(match.player1_submitted).toBe(true);
    expect(match.player2_submitted).toBe(true);
  });

  test("card_pools updated for BOTH players on match decision", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const pool1 = await getPool_(f.db, f.pool1ShareId);
    expect(pool1.wins).toBe(1);
    expect(pool1.losses).toBe(0);
    expect(pool1.wayfinder_match_ids).toContain("wf-sweep-001");

    const pool2 = await getPool_(f.db, f.pool2ShareId);
    expect(pool2.wins).toBe(0);
    expect(pool2.losses).toBe(1);
    expect(pool2.wayfinder_match_ids).toContain("wf-sweep-001");
  });

  test("round marked complete (only match in round)", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const round = await getRound(f.db, f.roundId);
    expect(round.status).toBe("complete");
    expect(round.completed_at).not.toBeNull();
  });
});

// ── 4. Per-Game Reporting — 2-1 Split ───────────────────────────────────────

test.describe("Competitive Bo3 — 2-1 Split", () => {
  let f: CompetitiveFixture;

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    f = await createCompetitiveFixture();
  });

  test.afterAll(async () => {
    if (f?.db) await f.db.end();
  });

  test("game 1: player1 wins", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const res = await postMatchResult(
      f.pool1ShareId,
      "win",
      "wf-split-001",
      1
    );
    expect(res.status).toBe(200);

    const match = await getMatch(f.db, f.matchId);
    expect(match.game1_result).toBe("player1");
    expect(match.final_confirmed).toBe(false);
  });

  test("game 2: player1 loses (1-1 split)", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const res = await postMatchResult(
      f.pool1ShareId,
      "loss",
      "wf-split-001",
      2
    );
    expect(res.status).toBe(200);

    const match = await getMatch(f.db, f.matchId);
    expect(match.game1_result).toBe("player1");
    expect(match.game2_result).toBe("player2");
    expect(match.final_confirmed).toBe(false);
    expect(match.match_winner).toBeNull();
  });

  test("card_pools still untouched at 1-1", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const pool1 = await getPool_(f.db, f.pool1ShareId);
    expect(pool1.wins).toBe(0);
    expect(pool1.losses).toBe(0);
  });

  test("game 3: player1 wins (2-1, match decides)", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const res = await postMatchResult(
      f.pool1ShareId,
      "win",
      "wf-split-001",
      3
    );
    expect(res.status).toBe(200);

    const match = await getMatch(f.db, f.matchId);
    expect(match.game1_result).toBe("player1");
    expect(match.game2_result).toBe("player2");
    expect(match.game3_result).toBe("player1");
    expect(match.final_confirmed).toBe(true);
    expect(match.match_winner).toBe("player1");
  });

  test("card_pools updated correctly for 2-1", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const pool1 = await getPool_(f.db, f.pool1ShareId);
    expect(pool1.wins).toBe(1);
    expect(pool1.losses).toBe(0);
    expect(pool1.wayfinder_match_ids).toContain("wf-split-001");

    const pool2 = await getPool_(f.db, f.pool2ShareId);
    expect(pool2.losses).toBe(1);
    expect(pool2.wins).toBe(0);
    expect(pool2.wayfinder_match_ids).toContain("wf-split-001");
  });
});

// ── 5. Player 2 Perspective (reporting from the other side) ─────────────────

test.describe("Competitive Bo3 — Player 2 Reports", () => {
  let f: CompetitiveFixture;

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    f = await createCompetitiveFixture();
  });

  test.afterAll(async () => {
    if (f?.db) await f.db.end();
  });

  test("player2 reporting win maps to player2 in DB", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    // Player 2 reports a win (from their perspective)
    const res = await postMatchResult(
      f.pool2ShareId,
      "win",
      "wf-p2-001",
      1
    );
    expect(res.status).toBe(200);

    const match = await getMatch(f.db, f.matchId);
    // player2's "win" should be stored as "player2" in the game result
    expect(match.game1_result).toBe("player2");
    expect(match.final_confirmed).toBe(false);
  });

  test("player2 2-0 sweep confirms correctly", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const res = await postMatchResult(
      f.pool2ShareId,
      "win",
      "wf-p2-001",
      2
    );
    expect(res.status).toBe(200);

    const match = await getMatch(f.db, f.matchId);
    expect(match.game2_result).toBe("player2");
    expect(match.final_confirmed).toBe(true);
    expect(match.match_winner).toBe("player2");
  });

  test("card_pools: player2 gets win, player1 gets loss", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const pool2 = await getPool_(f.db, f.pool2ShareId);
    expect(pool2.wins).toBe(1);
    expect(pool2.losses).toBe(0);

    const pool1 = await getPool_(f.db, f.pool1ShareId);
    expect(pool1.wins).toBe(0);
    expect(pool1.losses).toBe(1);
  });
});

// ── 6. Draw Handling ────────────────────────────────────────────────────────

test.describe("Competitive Bo3 — Draw", () => {
  let f: CompetitiveFixture;

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    f = await createCompetitiveFixture();
  });

  test.afterAll(async () => {
    if (f?.db) await f.db.end();
  });

  test("game ending in draw stores correctly", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const res = await postMatchResult(
      f.pool1ShareId,
      "draw",
      "wf-draw-001",
      1
    );
    expect(res.status).toBe(200);

    const match = await getMatch(f.db, f.matchId);
    expect(match.game1_result).toBe("draw");
    expect(match.final_confirmed).toBe(false);
  });

  test("three draws produces match-level draw", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    await postMatchResult(f.pool1ShareId, "draw", "wf-draw-001", 2);

    // After 2 draws, still no winner (nobody has 2 wins), but 2 non-null
    // games exist. deriveMatchWinner returns null because nobody has 2 wins.
    let match = await getMatch(f.db, f.matchId);
    expect(match.final_confirmed).toBe(false);

    await postMatchResult(f.pool1ShareId, "draw", "wf-draw-001", 3);

    match = await getMatch(f.db, f.matchId);
    expect(match.game3_result).toBe("draw");
    // 3 games, nobody has 2 wins → deriveMatchWinner returns 'draw'
    expect(match.final_confirmed).toBe(true);
    expect(match.match_winner).toBe("draw");
  });

  test("card_pools: both players get +1 draw", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const pool1 = await getPool_(f.db, f.pool1ShareId);
    expect(pool1.draws).toBe(1);
    expect(pool1.wins).toBe(0);
    expect(pool1.losses).toBe(0);

    const pool2 = await getPool_(f.db, f.pool2ShareId);
    expect(pool2.draws).toBe(1);
    expect(pool2.wins).toBe(0);
    expect(pool2.losses).toBe(0);
  });
});

// ── 7. Non-Competitive — Backward Compatibility ─────────────────────────────

test.describe("Competitive Bo3 — Non-Competitive Backward Compat", () => {
  test("non-competitive pool updates card_pools immediately (no gameNumber)", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      const user = await createTestUser("NCPlayer", TEST_ID);
      const shareId = await createNonCompetitivePool(db, user.user.id);

      const res = await postMatchResult(shareId, "win", "wf-nc-001");
      expect(res.status).toBe(200);

      const pool = await getPool_(db, shareId);
      expect(pool.wins).toBe(1);
      expect(pool.losses).toBe(0);
      expect(pool.wayfinder_match_ids).toContain("wf-nc-001");
    } finally {
      await db.end();
    }
  });

  test("non-competitive pool updates card_pools with gameNumber (still works)", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      const user = await createTestUser("NCPlayerGN", TEST_ID);
      const shareId = await createNonCompetitivePool(db, user.user.id);

      await postMatchResult(shareId, "win", "wf-nc-gn1", 1);
      await postMatchResult(shareId, "loss", "wf-nc-gn2", 2);

      const pool = await getPool_(db, shareId);
      // Non-competitive: each call increments directly
      expect(pool.wins).toBe(1);
      expect(pool.losses).toBe(1);
      expect(pool.wayfinder_match_ids).toContain("wf-nc-gn1");
      expect(pool.wayfinder_match_ids).toContain("wf-nc-gn2");
    } finally {
      await db.end();
    }
  });

  test("non-competitive pool: no gameNumber falls back to next-slot (legacy)", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      const user = await createTestUser("LegacyP", TEST_ID);
      const shareId = await createNonCompetitivePool(db, user.user.id);

      // Three consecutive calls without gameNumber
      await postMatchResult(shareId, "win", "wf-legacy-1");
      await postMatchResult(shareId, "loss", "wf-legacy-2");
      await postMatchResult(shareId, "win", "wf-legacy-3");

      const pool = await getPool_(db, shareId);
      expect(pool.wins).toBe(2);
      expect(pool.losses).toBe(1);
      expect(pool.wayfinder_match_ids.length).toBe(3);
    } finally {
      await db.end();
    }
  });
});

// ── 8. Idempotency ──────────────────────────────────────────────────────────

test.describe("Competitive Bo3 — Idempotency", () => {
  let f: CompetitiveFixture;

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    f = await createCompetitiveFixture();
  });

  test.afterAll(async () => {
    if (f?.db) await f.db.end();
  });

  test("sending same gameNumber twice is idempotent (no corruption)", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    // First call
    const res1 = await postMatchResult(
      f.pool1ShareId,
      "win",
      "wf-idem-001",
      1
    );
    expect(res1.status).toBe(200);

    // Duplicate call for same game
    const res2 = await postMatchResult(
      f.pool1ShareId,
      "win",
      "wf-idem-001",
      1
    );
    expect(res2.status).toBe(200);

    const match = await getMatch(f.db, f.matchId);
    expect(match.game1_result).toBe("player1");
    expect(match.game2_result).toBeNull();
    expect(match.game3_result).toBeNull();
    expect(match.final_confirmed).toBe(false);
  });

  test("card_pools remain untouched after duplicate (not incremented)", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const pool1 = await getPool_(f.db, f.pool1ShareId);
    expect(pool1.wins).toBe(0);
    expect(pool1.losses).toBe(0);
  });
});

// ── 9. Both Players Report Same Game ────────────────────────────────────────

test.describe("Competitive Bo3 — Both Players Report", () => {
  let f: CompetitiveFixture;

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    f = await createCompetitiveFixture();
  });

  test.afterAll(async () => {
    if (f?.db) await f.db.end();
  });

  test("both players report game 1 — same result stored", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    // Player 1 reports win for game 1
    const res1 = await postMatchResult(
      f.pool1ShareId,
      "win",
      "wf-both-001",
      1
    );
    expect(res1.status).toBe(200);

    // Player 2 reports loss for game 1 (same outcome, different perspective)
    const res2 = await postMatchResult(
      f.pool2ShareId,
      "loss",
      "wf-both-001",
      1
    );
    expect(res2.status).toBe(200);

    const match = await getMatch(f.db, f.matchId);
    // Both map to "player1" — no corruption
    expect(match.game1_result).toBe("player1");
    expect(match.game2_result).toBeNull();
    expect(match.final_confirmed).toBe(false);
  });

  test("both players report game 2 — match decides", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    // Player 1 reports win for game 2
    await postMatchResult(f.pool1ShareId, "win", "wf-both-001", 2);
    // Player 2 also reports loss for game 2
    await postMatchResult(f.pool2ShareId, "loss", "wf-both-001", 2);

    const match = await getMatch(f.db, f.matchId);
    expect(match.game2_result).toBe("player1");
    expect(match.final_confirmed).toBe(true);
    expect(match.match_winner).toBe("player1");
  });

  test("card_pools correct despite double-reporting", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const pool1 = await getPool_(f.db, f.pool1ShareId);
    // Winner should have exactly 1 win, not 2
    expect(pool1.wins).toBe(1);

    const pool2 = await getPool_(f.db, f.pool2ShareId);
    expect(pool2.losses).toBe(1);
  });
});

// ── 10. Error Cases ─────────────────────────────────────────────────────────

test.describe("Competitive Bo3 — Error Cases", () => {
  test("competitive pool with no active round returns 404", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      const user = await createTestUser("NoRoundP", TEST_ID, {
        isBetaTester: true,
      });
      const { podId } = await createCompetitivePod(db, user.user.id);
      await addPlayerToPod(db, podId, user.user.id, 1);
      const shareId = await createPoolForPlayer(db, user.user.id, podId);
      // No practice_round created

      const res = await postMatchResult(shareId, "win", "wf-noround", 1);
      expect(res.status).toBe(404);
    } finally {
      await db.end();
    }
  });

  test("competitive pool with no active match for player returns 404", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      const user = await createTestUser("NoMatchP", TEST_ID, {
        isBetaTester: true,
      });
      const other = await createTestUser("NoMatchO", TEST_ID);
      const { podId } = await createCompetitivePod(db, user.user.id);
      await addPlayerToPod(db, podId, user.user.id, 1);
      await addPlayerToPod(db, podId, other.user.id, 5);
      const userPoolShareId = await createPoolForPlayer(
        db,
        user.user.id,
        podId
      );
      await createPoolForPlayer(db, other.user.id, podId);

      const roundId = await createActiveRound(db, podId, 1);
      // Create a match between other players (not our user)
      // Actually just don't create any match at all
      // Round exists but no match for this player

      const res = await postMatchResult(
        userPoolShareId,
        "win",
        "wf-nomatch",
        1
      );
      expect(res.status).toBe(404);
    } finally {
      await db.end();
    }
  });

  test("already-confirmed match returns 404 for subsequent reports", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      const p1 = await createTestUser("ConfP1", TEST_ID, {
        isBetaTester: true,
      });
      const p2 = await createTestUser("ConfP2", TEST_ID);
      const { podId } = await createCompetitivePod(db, p1.user.id);
      await addPlayerToPod(db, podId, p1.user.id, 1);
      await addPlayerToPod(db, podId, p2.user.id, 5);
      const pool1Id = await createPoolForPlayer(db, p1.user.id, podId);
      await createPoolForPlayer(db, p2.user.id, podId);

      const roundId = await createActiveRound(db, podId, 1);
      const matchId = await createPracticeMatch(
        db,
        roundId,
        podId,
        p1.user.id,
        p2.user.id
      );

      // Pre-confirm the match directly
      await db.query(
        `UPDATE practice_matches SET final_confirmed = true, match_winner = 'player1' WHERE id = $1`,
        [matchId]
      );

      const res = await postMatchResult(pool1Id, "win", "wf-already", 1);
      expect(res.status).toBe(404);
    } finally {
      await db.end();
    }
  });

  test("unknown pool returns 404", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const res = await postMatchResult(
      "nonexistent-pool-id",
      "win",
      "wf-ghost",
      1
    );
    expect(res.status).toBe(404);
  });
});

// ── 11. Round Advancement — Multi-Match Round ───────────────────────────────

test.describe("Competitive Bo3 — Round Advancement", () => {
  test("round does NOT advance until ALL matches in round are confirmed", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      // Create a 4-player pod with 2 matches in round 1
      const p1 = await createTestUser("AdvP1", TEST_ID, {
        isBetaTester: true,
      });
      const p2 = await createTestUser("AdvP2", TEST_ID);
      const p3 = await createTestUser("AdvP3", TEST_ID);
      const p4 = await createTestUser("AdvP4", TEST_ID);

      const { podId, podShareId } = await createCompetitivePod(
        db,
        p1.user.id
      );
      await addPlayerToPod(db, podId, p1.user.id, 1);
      await addPlayerToPod(db, podId, p2.user.id, 2);
      await addPlayerToPod(db, podId, p3.user.id, 3);
      await addPlayerToPod(db, podId, p4.user.id, 4);

      const pool1 = await createPoolForPlayer(db, p1.user.id, podId);
      const pool2 = await createPoolForPlayer(db, p2.user.id, podId);
      const pool3 = await createPoolForPlayer(db, p3.user.id, podId);
      const pool4 = await createPoolForPlayer(db, p4.user.id, podId);

      const roundId = await createActiveRound(db, podId, 1);
      const match1Id = await createPracticeMatch(
        db,
        roundId,
        podId,
        p1.user.id,
        p2.user.id
      );
      const match2Id = await createPracticeMatch(
        db,
        roundId,
        podId,
        p3.user.id,
        p4.user.id
      );

      // Finish match 1 (2-0)
      await postMatchResult(pool1, "win", "wf-adv-m1", 1);
      await postMatchResult(pool1, "win", "wf-adv-m1", 2);

      // Match 1 confirmed, but match 2 still open
      const match1 = await getMatch(db, match1Id);
      expect(match1.final_confirmed).toBe(true);

      const match2 = await getMatch(db, match2Id);
      expect(match2.final_confirmed).toBe(false);

      // Round should still be active
      const round = await getRound(db, roundId);
      expect(round.status).toBe("active");

      // Now finish match 2 (2-0)
      await postMatchResult(pool3, "win", "wf-adv-m2", 1);
      await postMatchResult(pool3, "win", "wf-adv-m2", 2);

      const match2After = await getMatch(db, match2Id);
      expect(match2After.final_confirmed).toBe(true);

      // NOW round should be complete
      const roundAfter = await getRound(db, roundId);
      expect(roundAfter.status).toBe("complete");

      // And round 2 should have been created
      const rounds = await getRoundsByPod(db, podId);
      expect(rounds.length).toBe(2);
      expect(rounds[1].round_number).toBe(2);
      expect(rounds[1].status).toBe("active");

      // Round 2 should have 2 matches (Swiss pairing for 4 players)
      const r2Matches = await getMatchesForRound(db, rounds[1].id);
      expect(r2Matches.length).toBe(2);
    } finally {
      await db.end();
    }
  });
});

// ── 12. wayfinder_match_id stored on practice_match ─────────────────────────

test.describe("Competitive Bo3 — wayfinder_match_id", () => {
  test("wayfinder_match_id is stored and updated on the practice_match", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      const p1 = await createTestUser("WfIdP1", TEST_ID, {
        isBetaTester: true,
      });
      const p2 = await createTestUser("WfIdP2", TEST_ID);

      const { podId } = await createCompetitivePod(db, p1.user.id);
      await addPlayerToPod(db, podId, p1.user.id, 1);
      await addPlayerToPod(db, podId, p2.user.id, 5);
      const pool1 = await createPoolForPlayer(db, p1.user.id, podId);
      await createPoolForPlayer(db, p2.user.id, podId);

      const roundId = await createActiveRound(db, podId, 1);
      const matchId = await createPracticeMatch(
        db,
        roundId,
        podId,
        p1.user.id,
        p2.user.id
      );

      // Before any results, wayfinder_match_id is null
      let match = await getMatch(db, matchId);
      expect(match.wayfinder_match_id).toBeNull();

      // After game 1
      await postMatchResult(pool1, "win", "wf-id-test", 1);
      match = await getMatch(db, matchId);
      expect(match.wayfinder_match_id).toBe("wf-id-test");

      // After game 2 (same matchId, should remain)
      await postMatchResult(pool1, "win", "wf-id-test", 2);
      match = await getMatch(db, matchId);
      expect(match.wayfinder_match_id).toBe("wf-id-test");
    } finally {
      await db.end();
    }
  });
});

// ── 13. Fallback — No gameNumber on Competitive Pool ────────────────────────

test.describe("Competitive Bo3 — Fallback Without gameNumber", () => {
  let f: CompetitiveFixture;

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    f = await createCompetitiveFixture();
  });

  test.afterAll(async () => {
    if (f?.db) await f.db.end();
  });

  test("without gameNumber, fills next empty slot (legacy compat)", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    // Call without gameNumber — should fill game1
    const res1 = await postMatchResult(
      f.pool1ShareId,
      "win",
      "wf-fallback-001"
    );
    expect(res1.status).toBe(200);

    let match = await getMatch(f.db, f.matchId);
    expect(match.game1_result).toBe("player1");
    expect(match.game2_result).toBeNull();

    // Another call without gameNumber — should fill game2
    const res2 = await postMatchResult(
      f.pool1ShareId,
      "win",
      "wf-fallback-001"
    );
    expect(res2.status).toBe(200);

    match = await getMatch(f.db, f.matchId);
    expect(match.game2_result).toBe("player1");
    // 2-0 → match should be decided
    expect(match.final_confirmed).toBe(true);
    expect(match.match_winner).toBe("player1");
  });
});

// ── 14. Full 3-Round Tournament Lifecycle ───────────────────────────────────

test.describe("Competitive Bo3 — Full 3-Round Tournament", () => {
  test("3 rounds auto-create and complete, matchmakingStatus becomes complete", async () => {
    test.skip(!SERVICE_KEY, "PTP_SERVICE_KEY not set");
    const db = await getPool();
    try {
      // 2-player pod: 3 rounds, same matchup each time
      const p1 = await createTestUser("TournP1", TEST_ID, {
        isBetaTester: true,
      });
      const p2 = await createTestUser("TournP2", TEST_ID);

      const { podId, podShareId } = await createCompetitivePod(
        db,
        p1.user.id
      );
      await addPlayerToPod(db, podId, p1.user.id, 1);
      await addPlayerToPod(db, podId, p2.user.id, 5);
      const pool1 = await createPoolForPlayer(db, p1.user.id, podId);
      const pool2 = await createPoolForPlayer(db, p2.user.id, podId);

      // === Round 1 ===
      const r1Id = await createActiveRound(db, podId, 1);
      await createPracticeMatch(db, r1Id, podId, p1.user.id, p2.user.id);

      // Player 1 wins 2-0
      await postMatchResult(pool1, "win", "wf-tourn-r1", 1);
      await postMatchResult(pool1, "win", "wf-tourn-r1", 2);

      let rounds = await getRoundsByPod(db, podId);
      expect(rounds.length).toBe(2);
      expect(rounds[0].status).toBe("complete");
      expect(rounds[1].status).toBe("active");
      expect(rounds[1].round_number).toBe(2);

      // === Round 2 ===
      const r2Matches = await getMatchesForRound(db, rounds[1].id);
      expect(r2Matches.length).toBe(1);
      // Find the player's pool to report from
      const r2Player1IsP1 = r2Matches[0].player1_id === p1.user.id;
      const r2ReportPool = r2Player1IsP1 ? pool1 : pool2;

      // Player wins 2-1
      await postMatchResult(r2ReportPool, "win", "wf-tourn-r2", 1);
      await postMatchResult(r2ReportPool, "loss", "wf-tourn-r2", 2);
      await postMatchResult(r2ReportPool, "win", "wf-tourn-r2", 3);

      rounds = await getRoundsByPod(db, podId);
      expect(rounds.length).toBe(3);
      expect(rounds[1].status).toBe("complete");
      expect(rounds[2].status).toBe("active");
      expect(rounds[2].round_number).toBe(3);

      // === Round 3 ===
      const r3Matches = await getMatchesForRound(db, rounds[2].id);
      expect(r3Matches.length).toBe(1);
      const r3Player1IsP1 = r3Matches[0].player1_id === p1.user.id;
      const r3ReportPool = r3Player1IsP1 ? pool1 : pool2;

      // Player wins 2-0
      await postMatchResult(r3ReportPool, "win", "wf-tourn-r3", 1);
      await postMatchResult(r3ReportPool, "win", "wf-tourn-r3", 2);

      // All 3 rounds should be complete
      rounds = await getRoundsByPod(db, podId);
      expect(rounds.length).toBe(3);
      expect(rounds[0].status).toBe("complete");
      expect(rounds[1].status).toBe("complete");
      expect(rounds[2].status).toBe("complete");

      // matchmakingStatus should be 'complete' after round 3
      const pod = await db.query(
        `SELECT draft_state FROM pods WHERE id = $1`,
        [podId]
      );
      const draftState = pod.rows[0].draft_state;
      expect(draftState.matchmakingStatus).toBe("complete");

      // Card pools should show cumulative W/L
      const p1Pool = await getPool_(db, pool1);
      const p2Pool = await getPool_(db, pool2);
      // p1 won all 3 rounds
      expect(p1Pool.wins).toBe(3);
      expect(p1Pool.losses).toBe(0);
      expect(p1Pool.wayfinder_match_ids.length).toBe(3);
      expect(p2Pool.wins).toBe(0);
      expect(p2Pool.losses).toBe(3);
      expect(p2Pool.wayfinder_match_ids.length).toBe(3);
    } finally {
      await db.end();
    }
  });
});

// ── Cleanup ─────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await cleanupTestUsers(TEST_ID);
  await closeDb();
});
