// Generic pool/Pack Wars/Blitz external launch and monitoring metadata is retired.
// Exported deck JSON remains available separately as a secondary utility.
import { legacyPlayRetired } from '@/src/services/play/legacyRetirement'
export function GET() { return legacyPlayRetired() }
