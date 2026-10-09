import {betaExperienceEnabled} from '@/src/services/entry/rollout';
import { entryTableImage } from "@/src/services/entry/presentation";
import { unfinishedItems } from "@/src/services/entry/resumes";
import { requireAlphaAccess } from "@/lib/auth";
import { queryRows } from "@/lib/db";
import { getAllCards } from "@/src/utils/cardData";
import { SET_CONFIGS } from "@/src/utils/setConfigs";
import { getUnavailableSetReason } from "@/src/utils/setAvailability";
import { getCyclingPackImageUrls } from "@/src/utils/packArt";
import { handleApiError, jsonResponse } from "@/lib/utils";
export async function GET(request: Request) {
  try {
    if(!betaExperienceEnabled())return Response.json({error:'Not found'},{status:404});
    const user = await requireAlphaAccess(request);
    const cards = getAllCards();
    const latest = Object.values(SET_CONFIGS)
      .filter(
        (c) =>
          !getUnavailableSetReason(c.setCode, user) &&
          cards.some((x) => x.set === c.setCode),
      )
      .sort((a, b) => b.setNumber - a.setNumber)[0]!;
    const normal = cards.filter(
      (c) => c.set === latest.setCode && c.variantType === "Normal",
    );
    const resumes = await unfinishedItems(user.id, cards);
    const usage = await queryRows(
      `SELECT deck_builder_state->'cardPositions'->(deck_builder_state->>'activeLeader')->'card'->>'name' AS leader_name,COUNT(*)::int AS uses FROM card_pools WHERE set_code=$1 AND COALESCE(wins,0)+COALESCE(losses,0)+COALESCE(draws,0)>0 GROUP BY leader_name`,
      [latest.setCode],
    );
    const counts = new Map(
      usage.map((row) => [String(row.leader_name), Number(row.uses)]),
    );
    const leaders = normal
      .filter((c) => c.type === "Leader")
      .sort(
        (a, b) =>
          (counts.get(b.name) || 0) - (counts.get(a.name) || 0) ||
          Number(b.rarity === "Special") - Number(a.rarity === "Special") ||
          Number(a.number) - Number(b.number),
      )
      .slice(0, 2);
    // Use distinct primary aspect colors rather than three adjacent catalog cards.
    const seenColors = new Set<string>();
    const commons = normal
      .filter((card) => {
        if (card.rarity !== "Common" || card.type !== "Unit") return false;
        const color = card.aspects.find((aspect) =>
          ["Vigilance", "Command", "Aggression", "Cunning"].includes(aspect),
        );
        if (!color || seenColors.has(color)) return false;
        seenColors.add(color);
        return true;
      })
      .slice(0, 3);
    return jsonResponse({
      latest: {
        code: latest.setCode,
        name: latest.setName,
        prereleaseDate: latest.prereleaseDate,
        releaseDate: latest.releaseDate,
        public: !getUnavailableSetReason(latest.setCode, null),
      },
      tableImage: entryTableImage(latest.setCode),
      commons: commons.map((c) => ({ name: c.name, imageUrl: c.imageUrl })),
      leaders: leaders.map((c) => ({ name: c.name, imageUrl: c.imageUrl })),
      packs: getCyclingPackImageUrls(latest.setCode, 3),
      resumes,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
