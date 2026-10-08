/**
 * Migration 093: rename the VADER pack from "Vader" to "Darth Vader".
 *
 * WHY NOT JUST EDIT 090
 * =====================
 * 090 has already run in dev and production, and migrations do not re-run, so
 * editing its literal would change what a FRESH database seeds while leaving every
 * existing one saying "Vader". Same reasoning 088 gives for existing alongside 086:
 * the original stays as it was, and a correction arrives as its own migration.
 *
 * On a fresh database this runs immediately after 090 and renames the row it just
 * inserted, which is a wasted UPDATE and the correct trade for having exactly one
 * story about how the name got there.
 *
 * Matched on `code`, not on the old display name: the code is the identity, and a
 * pack whose name somebody has since edited should still end up renamed rather than
 * silently skipped.
 */
const PACK_CODE = 'VADER'
const NEW_NAME = 'Darth Vader'

export async function run(client) {
  const result = await client.query(
    `UPDATE voice_packs SET display_name = $2, updated_at = NOW()
     WHERE code = $1 AND display_name IS DISTINCT FROM $2`,
    [PACK_CODE, NEW_NAME]
  )
  if (result.rowCount === 0) {
    // Either the pack is absent (a database that predates 090) or it is already
    // named correctly. Neither is a failure.
    console.log(`093: nothing to rename — ${PACK_CODE} is absent or already "${NEW_NAME}".`)
    return
  }
  console.log(`093: renamed ${PACK_CODE} to "${NEW_NAME}".`)
}
