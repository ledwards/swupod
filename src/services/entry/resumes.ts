import { queryRows } from "@/lib/db";
import { resumeArt } from "./resumeArt";
import { summarizeDeckBuilderState } from "@/src/services/play/playState";
import { getAllCards } from "@/src/utils/cardData";

export type UnfinishedItem = {
  imageUrl: string | null;
  artKind: "leader" | "set";
  id: string;
  label: string;
  action: string;
  href: string;
};

/**
 * Pods still in progress and pools whose deck is not finished, for the
 * "pick up where you left off" list. Shared by the homepage and the beta entry
 * page so there is exactly one definition of "unfinished".
 */
export async function unfinishedItems(userId: string, cards = getAllCards()): Promise<UnfinishedItem[]> {
  // Resume suggestions expire seven days after creation; generic updates must
  // not resurrect old pools or pods. History retains them independently.
  const pools = await queryRows(
    `SELECT p.share_id,p.set_code,p.pool_type,p.deck_builder_state,p.name,d.share_id AS pod_share_id FROM card_pools p LEFT JOIN pods d ON d.id=p.pod_id WHERE p.user_id=$1 AND p.hidden IS NOT TRUE AND p.created_at >= NOW() - INTERVAL '7 days' ORDER BY p.created_at DESC LIMIT 100`,
    [userId],
  );
  const pods = await queryRows(
    `SELECT DISTINCT d.share_id,d.name,d.status,d.set_code,d.pod_type,d.competitive,d.draft_state,d.created_at FROM pods d JOIN pod_players p ON p.pod_id=d.id WHERE p.user_id=$1 AND p.is_bot IS NOT TRUE AND d.created_at >= NOW() - INTERVAL '7 days' ORDER BY d.created_at DESC`,
    [userId],
  );
  const resumes: UnfinishedItem[] = [];
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
  return resumes;
}
