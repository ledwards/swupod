import { requireAuth } from "@/lib/auth";
import { unfinishedItems } from "@/src/services/entry/resumes";
import { handleApiError, jsonResponse } from "@/lib/utils";

/** GET /api/home/resumes — the signed-in player's unfinished pods and decks for the homepage. */
export async function GET(request: Request) {
  try {
    const session = requireAuth(request);
    const resumes = await unfinishedItems(session.id);
    return jsonResponse({ resumes }, 200, null);
  } catch (e) {
    return handleApiError(e);
  }
}
