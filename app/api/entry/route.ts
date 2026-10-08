import {betaExperienceEnabled} from '@/src/services/entry/rollout';
import { entryTableImage } from "@/src/services/entry/presentation";
import { resumeArt } from "@/src/services/entry/resumeArt";
import { requireAlphaAccess } from "@/lib/auth";
import { queryRows } from "@/lib/db";
import { getAllCards } from "@/src/utils/cardData";
import { SET_CONFIGS } from "@/src/utils/setConfigs";
import { getUnavailableSetReason } from "@/src/utils/setAvailability";
import { getCyclingPackImageUrls } from "@/src/utils/packArt";
import { summarizeDeckBuilderState } from "@/src/services/play/playState";
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
    // Resume suggestions expire seven days after creation; generic updates must
    // not resurrect old pools or pods. History retains them independently.
    const pools = await queryRows(
      `SELECT p.share_id,p.set_code,p.pool_type,p.deck_builder_state,p.name,d.share_id AS pod_share_id FROM card_pools p LEFT JOIN pods d ON d.id=p.pod_id WHERE p.user_id=$1 AND p.hidden IS NOT TRUE AND p.created_at >= NOW() - INTERVAL '7 days' ORDER BY p.created_at DESC LIMIT 100`,
      [user.id],
    );
    const pods = await queryRows(
      `SELECT DISTINCT d.share_id,d.name,d.status,d.set_code,d.pod_type,d.competitive,d.draft_state,d.created_at FROM pods d JOIN pod_players p ON p.pod_id=d.id WHERE p.user_id=$1 AND p.is_bot IS NOT TRUE AND d.created_at >= NOW() - INTERVAL '7 days' ORDER BY d.created_at DESC`,
      [user.id],
    );
    const resumes: Array<{
      imageUrl: string | null;
      artKind: "leader" | "set";
      id: string;
      label: string;
      action: string;
      href: string;
    }> = [];
    for (const pod of pods) {
      const active = [
        "waiting",
        "drafting",
        "leader_selection",
        "leader_draft",
        "leader_preview",
        "pack_draft",
      ].includes(String(pod.status));
      const tournament =
        typeof pod.draft_state === "string"
          ? JSON.parse(pod.draft_state)
          : pod.draft_state;
      if (
        pod.status !== "cancelled" &&
        (active ||
          (pod.competitive &&
            tournament &&
            tournament.matchmakingStatus !== "complete"))
      )
        resumes.push({
          ...resumeArt(
            String(pod.set_code),
            pools.find((p) => p.pod_share_id === pod.share_id)
              ?.deck_builder_state,
            cards,
          ),
          id: `pod-${pod.share_id}`,
          label: `${pod.name || pod.set_code} · ${active ? String(pod.status).replaceAll("_", " ") : "Competitive event in progress"}`,
          action: active ? "Resume pod" : "Continue event",
          href: `/${pod.pod_type === "sealed" ? "sealed" : "draft"}/${pod.share_id}${active ? "" : "/pod"}`,
        });
    }
    for (const p of pools) {
      if (!["sealed", "draft"].includes(String(p.pool_type))) continue;
      const summary = summarizeDeckBuilderState({
        shareId: String(p.share_id),
        setCode: String(p.set_code),
        poolType: String(p.pool_type),
        deckBuilderState: p.deck_builder_state,
        name: p.name as string,
      });
      const minimum =
        summary.baseName === "Data Vault"
          ? 40
          : summary.baseName === "Thermal Oscillator"
            ? 25
            : 30;
      if (
        summary.mainDeckCount >= minimum &&
        summary.leaderName &&
        summary.baseName
      )
        continue;
      if (
        p.pod_share_id &&
        resumes.some((x) => x.id === `pod-${p.pod_share_id}`)
      )
        continue;
      resumes.push({
        ...resumeArt(String(p.set_code), p.deck_builder_state, cards),
        id: `pool-${p.share_id}`,
        label: `${p.name || p.set_code} · ${summary.mainDeckCount ? "Deck unfinished" : "Deck not built"}`,
        action: "Build deck",
        href: `/pool/${p.share_id}/deck`,
      });
    }
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
