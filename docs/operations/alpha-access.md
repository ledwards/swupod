# Alpha tester access

Alpha is an explicitly granted, smaller testing cohort. Alpha members also receive beta access. Neither tester tier grants patron customization or administrator privileges. Administrators can use alpha-only features without joining the cohort.

Migration `110_alpha_testers.sql` adds `users.is_alpha_tester` and keeps alpha members' beta flag enabled at the database level, including before the alpha application code is deployed. It is safe to rerun. Removing alpha preserves beta access; changing alpha membership increments `auth_version` so stale tokens cannot use privileged routes.

Use **Alpha access** in the admin grant panel to grant membership to an existing account or pre-provision a verified Discord ID. Personal rosters belong in database operations, never migrations or tracked files. Membership is explicit; changes in external team rosters do not automatically add or revoke access.

Use `requireAlphaAccess` for alpha-only server routes and `hasAlphaAccess` for UI visibility. Server gates verify session freshness. Refresh the session or sign in again after an access change. Existing beta features remain available to beta testers.

## Branch rollout

The beta-rollout branch experience now requires alpha membership (or administrator access), including entry navigation, new draft presentation, native play, AI runs, resumed games, and restored gameplay APIs. Beta membership alone does not enable these surfaces. The existing `PTP_BETA_EXPERIENCE_ENABLED` deployment switch remains the global kill switch; it does not grant user access.

For gateway compatibility, the internal entitlements response retains its `beta` field name, but that field now means alpha-authorized native-play access. Existing gateway sessions are therefore checked against alpha membership too. Ordinary beta-program benefits outside this rollout keep their existing eligibility.
