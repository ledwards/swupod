# Beta Access & Role Management

This document describes the user roles, beta access system, and admin management for Protect the Pod.

## Quick Start

**For users:** Visit `/beta` to join the beta program.

**For admins:** Grant admin access via CLI:
```bash
npm run make-admin user@example.com
```

---

## User Roles

Two boolean flags on user accounts:

| Flag | Description |
|------|-------------|
| `is_admin` | Full administrative access, includes beta access |
| `is_beta_tester` | Access to pre-release sets and features |

Admins automatically have beta access (no need to set both flags).

---

## Beta Signup Page

**URL:** `/beta`

Three states:
1. **Not logged in** → Shows Discord login button
2. **Logged in, not enrolled** → Shows "Join the Beta" button
3. **Has beta access** → Shows success confirmation

After enrollment, users are redirected to `/sets` where pre-release sets are visible.

---

## Pre-Release Sets

Sets marked with `beta: true` in their configuration are only visible to users with beta access.

**Current pre-release sets:**
- LAW (A Lawless Time) - Set 7

### Set Configuration

```javascript
// src/utils/setConfigs/LAW.js
export const LAW_CONFIG = {
  setCode: 'LAW',
  setName: 'A Lawless Time',
  setNumber: 7,
  beta: true,  // Requires beta access
  // ...
}
```

### API Filtering

```javascript
// Default: excludes pre-release sets
const sets = await fetchSets()

// Include pre-release sets (for beta users)
const allSets = await fetchSets({ includeBeta: true })
```

### UI Display

Pre-release sets appear with an orange "Pre-Release" badge in the set selection grid.

---

## API Endpoints

### GET /api/auth/session

Returns current user with role flags:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "username",
      "is_admin": false,
      "is_beta_tester": true
    }
  }
}
```

### POST /api/beta/enroll

Enrolls current user as beta tester. Also assigns the Discord beta tester role (best-effort, non-blocking).

- **Auth:** Required
- **Body:** None
- **Response:** Updated user object + new session cookie
- **Side effect:** Assigns `DISCORD_BETA_TESTER_ROLE_ID` role via Discord bot API (fails silently)

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "is_beta_tester": true
    }
  },
  "message": "Beta access granted"
}
```

### POST /api/auth/refresh

Refreshes session with latest data from database. Use when:
- Admin access granted via CLI (user needs fresh JWT)
- Permissions changed externally

- **Auth:** Required
- **Body:** None
- **Response:** Updated user object + new session cookie

---

## Admin Management

### Granting Admin Access

Use the CLI script:
```bash
# By email
npm run make-admin user@example.com

# By Discord ID
npm run make-admin -- --discord 123456789
```

Output:
```
Successfully granted admin access:
  ID: 49f858b7-...
  Email: user@example.com
  Username: username
  Discord ID: 123456789
  is_admin: true
```

### After Granting Admin

The user needs to refresh their session to get the new JWT:
1. Visit any page on the site
2. Open browser console
3. Run: `fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).then(() => location.reload())`

Or they can log out and log back in.

---

## Server-Side Authorization

### Auth Helpers

```javascript
import { requireAuth, requireBetaAccess, requireAdmin } from '@/lib/auth.js'

// Any authenticated user
export async function GET(request) {
  const session = requireAuth(request)
}

// Beta tester OR admin
export async function GET(request) {
  const session = requireBetaAccess(request)
}

// Admin only
export async function POST(request) {
  const session = requireAdmin(request)
}
```

### Error Responses

| Error | Status |
|-------|--------|
| `Unauthorized` | 401 |
| `Beta access required` | 403 |
| `Admin access required` | 403 |

---

## Client-Side Usage

### AuthContext

```jsx
import { useAuth } from '@/src/contexts/AuthContext'

function MyComponent() {
  const { user, enrollBeta, refreshSession } = useAuth()

  const hasBetaAccess = user?.is_beta_tester || user?.is_admin

  // Enroll in beta (updates state immediately)
  await enrollBeta()

  // Refresh session (picks up external changes)
  await refreshSession()
}
```

### Frontend Auth Utils

```javascript
import { enrollBeta, refreshSession } from '@/src/utils/auth'

// Enroll in beta
const user = await enrollBeta()

// Refresh session
const user = await refreshSession()
```

---

## Database Schema

```sql
-- Migration: 019_add_user_roles.sql
ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN is_beta_tester BOOLEAN DEFAULT FALSE;

-- Partial indexes for efficient queries
CREATE INDEX idx_users_is_beta_tester ON users(is_beta_tester)
  WHERE is_beta_tester = TRUE;
CREATE INDEX idx_users_is_admin ON users(is_admin)
  WHERE is_admin = TRUE;
```

---

## Testing

```bash
# All role/auth tests
npm run test:auth

# Beta enrollment API
node app/api/beta/enroll/route.test.js

# Session refresh API
node app/api/auth/refresh/route.test.js

# Beta page
node app/beta/page.test.js

# Admin script
node scripts/makeAdmin.test.js
```

---

## Discord Role Auto-Assignment

When a user enrolls as a beta tester, the server automatically assigns them the Discord beta tester role.

**Requirements:**
- `DISCORD_BOT_TOKEN` — Already configured for patron check
- `DISCORD_GUILD_ID` — Already configured for patron check
- `DISCORD_BETA_TESTER_ROLE_ID` — Role ID for the beta tester role
- Bot must have **Manage Roles** permission
- Bot's role must be **above** the beta tester role in the Discord role hierarchy

**Behavior:**
- Best-effort: enrollment succeeds even if Discord API call fails
- Non-blocking: the API call is fire-and-forget (`.catch(() => {})`)
- No-op if `DISCORD_BETA_TESTER_ROLE_ID` is not configured

---

## Security Notes

1. **JWT tokens** contain role flags. Changes require new token via:
   - Beta enrollment endpoint (returns new cookie)
   - Session refresh endpoint (returns new cookie)
   - Re-login

2. **Server-side validation** is authoritative. Client checks are for UX only.

3. **Idempotent enrollment** - calling `/api/beta/enroll` multiple times is safe.

4. **Admin script** requires database access. Protect credentials.

---

## Files Reference

| File | Purpose |
|------|---------|
| `app/beta/page.jsx` | Beta signup page |
| `app/api/beta/enroll/route.js` | Beta enrollment endpoint |
| `app/api/auth/refresh/route.js` | Session refresh endpoint |
| `lib/discord.ts` | Discord API utilities (patron check, role assignment) |
| `lib/auth.js` | Server auth helpers |
| `src/utils/auth.js` | Frontend auth utils |
| `src/contexts/AuthContext.jsx` | React auth context |
| `scripts/makeAdmin.js` | Admin CLI script |
| `migrations/019_add_user_roles.sql` | Database migration |
