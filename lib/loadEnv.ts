/**
 * Side-effect module that loads .env files BEFORE any other module reads
 * process.env at import time.
 *
 * Imports run in declaration order in ES modules, so importing this module
 * first in server.ts (and any script entry point) guarantees env vars are
 * populated before lib/db, lib/anthropic, etc. read them during their own
 * module initialization.
 *
 * override: true ensures values from local env files win over any pre-existing
 * shell env. Load the base .env first, then .env.local so local development can
 * override shared/default values like DATABASE_URL.
 *
 * Production (Railway) doesn't ship a .env file in the deploy, so override
 * has no effect on prod env injection.
 */

import dotenv from 'dotenv'

dotenv.config({ override: true })
dotenv.config({ path: '.env.local', override: true })
