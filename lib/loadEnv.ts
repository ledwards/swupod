// @ts-nocheck
/**
 * Side-effect module that loads .env files BEFORE any other module reads
 * process.env at import time.
 *
 * Imports run in declaration order in ES modules, so importing this module
 * first in server.ts (and any script entry point) guarantees env vars are
 * populated before lib/db, lib/anthropic, etc. read them during their own
 * module initialization.
 *
 * override: true ensures values from .env / .env.local win over any
 * pre-existing shell env. Without this, an empty 'ANTHROPIC_API_KEY=""'
 * exported from .zshrc / launchd / etc. blocks dotenv from loading the
 * real value.
 *
 * Production (Railway) doesn't ship a .env file in the deploy, so override
 * has no effect on prod env injection.
 */

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', override: true })
dotenv.config({ override: true })
