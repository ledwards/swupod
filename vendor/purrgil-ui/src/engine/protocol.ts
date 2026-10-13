// Baize's public play protocol, pinned and exercised by the compatibility tests.
// Never read debug state or derive legal actions from card text.
export interface ActiveEffect {description:string; duration:string; source:string|null}
export interface ObsCaptive {card:string; owner:number}
export interface ObsChoiceCard {index:number; card:string; zone:'deck'|'discard'|'resources'|'captives'|'hand'; owner:number}
export interface ObsUnit {
    captured?: ObsCaptive[];
    active_effects?: ActiveEffect[];
    owner?: number; upgrade_owners?: number[];
    uid: number; card: string; power: number; hp: number; damage: number;
    exhausted: boolean; keywords: string[]; upgrades: string[]; text?: string | null;
}
export const SCRIPT_DECISION_KINDS = ['selectTarget', 'optionalAbility', 'chooseMode', 'chooseNumber', 'indirectDamage', 'optionalPayment', 'revealHandCard', 'playRevealedCard', 'chooseMultipleTargets', 'chooseDiscardCard', 'discardHandCard', 'takeRevealedCard', 'includePlayer', 'choosePlayers', 'distributeDamage', 'playHandCard', 'payAnyNumber', 'returnResource', 'resourceHandCard', 'attachFromDiscard', 'chooseCapturedCard', 'revealResources', 'defeatTokens', 'defeatCredits', 'chooseArena', 'nameTrait', 'useAbility', 'nameCard', 'chooseDeckEnd', 'handToDeck', 'returnDiscardCard', 'playDiscardCard', 'revealMore', 'orderRevealedCards', 'discardToDeckBottom', 'revealFromHand', 'playOutOfZone', 'defeatResource'] as const;
export interface EventPreview {play: {PlayCard: number}; source_card: string; ability_index: number; step: number; targets: unknown[]}
export interface Observation {
    public_observer?: boolean;
    base_captured?: ObsCaptive[][];
    base_epic_used?: boolean[]; leader_epic_used?: boolean[];
    resource_exhausted?: boolean[][];
    public_resources?: [number,string][][];
    choice_cards?: ObsChoiceCard[];
    replacement_prompt?: {options?:string[];card:string;card_name:string;token:string|null;token_name:string|null;amount:number}|null;
    opp_known_top?: string[];
    my_bottom_segments?: string[][];
    my_top_seen_by_opponent?: number;
    permitted_upgrade_name?: string|null;
    unique_card_name?: string | null;
    leader_deploy_modes?: number[] | null;
    plot_options?: {index:number; resource_ix:number; card:string; has_effect:boolean}[];
    trigger_options?: {index: number; source_card: string; ability_index: number; keyword: 'Ambush' | 'Shielded' | null; no_effect?: boolean; batch_count?: number}[];
    revealed_cards?: {source_name: string; disclosed_aspects?: string[] | null; cards: string[]} | null;
    event_previews?: EventPreview[];
    activated_abilities?: {action: {UseAbility: unknown}; source_card: string; ability_index: number; has_effect: boolean}[];
    no_effect_plays?: {play: {PlayCard: number}; name: string; negated_by?: string}[];
    decision_context?: {disclosure?: {required: string[]; hand: string[][]; target_name: string; can_satisfy: boolean} | null; target_selection?: {budget: number | null; costs: [unknown, number][]} | null; effect_amount?: number | null; source_card: string; ability_index: number; step: number; kind: string; can_decline: boolean; mode_options: (string | null)[]; mode_target_name?: string | null; selection_limit?: number | null; peeked_count?: number} | null;
    distribution?: {fixed_per_target?: number | null; remaining: number; can_skip: boolean; can_stop_early: boolean; indirect: boolean; limits: [unknown, number][]} | null;
    player: number; phase: 'AssignInitiative' | 'Action' | {Mulligan: {decided: number}} | {PickResources: {picked: number}} | {RegroupResource: {decided: number}}; round: number; active: number; initiative: number;
    initiative_taken: number | null; pending_label: string | null;
    pending?: {owner: number; decision: unknown} | null;
    my_known_top?: string[];
    peeked_card_zone?: 'Deck' | 'Discard';
    my_hand_types?: string[];
    my_resource_slots?: [string, boolean][];
    my_hand: string[]; hand_sizes: number[]; deck_sizes: number[];
    resources: { name: string; count: number; text: string | null }[][];
    ground: ObsUnit[][]; space: ObsUnit[][]; discards: string[][];
    credits?: number[];
    has_force?: boolean[];
    bases: string[]; base_damage: number[]; leaders: string[];
}
export type ServerMessage =
    | { type: 'session'; session_id: string; game: string; seat: number; num_players: number }
    | { type: 'view'; presentationTargets?:string[]; step: number; to_move: number | null; observation: Observation; actions?: string[]; action_values?: unknown[]; aiError?: string; bots?: Array<string | null> }
    | { type: 'events'; step: number; events: { kind: string; player?: number; data: unknown; step?:number; ordinal?:number }[] }
    | { type: 'terminal'; step: number; returns: number[] }
    | { type: 'match'; clock: MatchClock; undo: UndoRequest | null; undoResolved?: { id: string; accepted: boolean } | null }
    | { type: 'error'; message: string };
/** Gateway byoyomi clocks: a per-prompt turn timer, then a main buffer that burns once it expires. */
export type MatchClock = { turnMs: number; mainMs: number; timedOut?: number | null; seats: { active: boolean; turnMs: number | null; mainMs: number; burning: boolean; status: 'ok' | 'warning' | 'danger' }[] };
export type UndoRequest = { id: string; seat: number; step: number; label: string; expiresAt: number };

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const uint = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const seat = (n: unknown) => n === 0 || n === 1;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const pair = (v: unknown, valid: (x: unknown) => boolean) => Array.isArray(v) && v.length === 2 && v.every(valid);
function phase(v: unknown): boolean {
    if (v === 'AssignInitiative' || v === 'Action') return true;
    if (!record(v) || Object.keys(v).length !== 1) return false;
    return [['Mulligan', 'decided'], ['PickResources', 'picked'], ['RegroupResource', 'decided']].some(([k, field]) => record(v[k]) && uint(v[k][field]));
}
const bools = (v:unknown):v is boolean[] => Array.isArray(v)&&v.every(x=>typeof x==='boolean');
const captive = (v:unknown):boolean => record(v)&&typeof v.card==='string'&&seat(v.owner);
function unit(v: unknown): boolean {
    return record(v) && uint(v.uid) && typeof v.card === 'string' && uint(v.power) && uint(v.hp)
        && uint(v.damage) && typeof v.exhausted === 'boolean' && strings(v.keywords) && strings(v.upgrades)
        && (v.captured === undefined || (Array.isArray(v.captured)&&v.captured.every(captive)))
        && (v.owner === undefined || seat(v.owner))
        && (v.upgrade_owners === undefined || (Array.isArray(v.upgrade_owners) && v.upgrade_owners.length === v.upgrades.length && v.upgrade_owners.every(seat)));
}
/**
 * The deck a deck-peek decision ("look at the top card of a deck") indexes, and the
 * cards of it the viewer knows, top first. A peek can be at EITHER deck (ASH_045
 * Reanimated Night Trooper, LAW_125 Watchful, SEC_220 Hired Slicer), so the owner comes
 * from the choice cards when Baize names one, otherwise whichever known top covers it.
 */
export function peekedDeck(o: Observation, count: number): {owner: number; cards: string[]} | null {
    const mine = Array.isArray(o.my_known_top) ? o.my_known_top : [];
    const theirs = Array.isArray(o.opp_known_top) ? o.opp_known_top : [];
    const named = Array.isArray(o.choice_cards) ? o.choice_cards.find(c => record(c) && c.zone === 'deck')?.owner : undefined;
    if (named === o.player) return {owner: o.player, cards: mine};
    if (named === 1 - o.player) return {owner: 1 - o.player, cards: theirs};
    if (mine.length >= count) return {owner: o.player, cards: mine};
    if (theirs.length >= count) return {owner: 1 - o.player, cards: theirs};
    return null;
}
/** The engine named the choice cards, and none of them is in a deck. */
function offDeckChoice(o: Record<string, unknown>): boolean {
    return Array.isArray(o.choice_cards) && o.choice_cards.length > 0 && o.choice_cards.every(c => record(c) && c.zone !== 'deck');
}
/**
 * Paths of the fields whose removal makes a rejected message valid: field NAMES only,
 * never values, so the log never carries hidden cards. Refines into nested objects.
 */
export function rejectedFields(v: unknown, path: string[] = [], root: unknown = v): string[] {
    if (!record(v)) return [];
    const out: string[] = [];
    for (const key of Object.keys(v)) {
        // A required parent never passes once removed, so look inside it first.
        const deeper = rejectedFields(v[key], [...path, key], root);
        if (deeper.length) { out.push(...deeper); continue; }
        const trial = structuredClone(root) as Record<string, unknown>;
        let parent: Record<string, unknown> = trial;
        for (const step of path) parent = parent[step] as Record<string, unknown>;
        delete parent[key];
        if (accepted(trial)) out.push([...path, key].join('.'));
    }
    return out;
}
export function parseMessage(raw: string): ServerMessage {
    const v: unknown = JSON.parse(raw);
    if (!accepted(v)) {
        const type = record(v) ? String(v.type) : typeof v;
        let fields: string[] = [];
        try { fields = rejectedFields(v); } catch { /* diagnosis only */ }
        console.error(`Baize protocol rejected a ${type} message; offending fields: ${fields.length ? fields.join(', ') : 'unknown (a required field)'}`);
        throw new Error('Baize protocol changed or returned an invalid message. Play is paused.');
    }
    return v as ServerMessage;
}
function accepted(v: unknown): boolean {
    let ok = false;
    if (record(v)) {
        switch (v.type) {
            case 'session': ok = typeof v.session_id === 'string' && typeof v.game === 'string' && seat(v.seat) && v.num_players === 2; break;
            case 'error': ok = typeof v.message === 'string'; break;
            case 'match': {
                const c = v.clock, u = v.undo, r = v.undoResolved;
                ok = record(c) && typeof c.turnMs === 'number' && typeof c.mainMs === 'number' && (c.timedOut === undefined || c.timedOut === null || seat(c.timedOut)) && Array.isArray(c.seats) && c.seats.length === 2
                    && c.seats.every(s => record(s) && typeof s.active === 'boolean' && (s.turnMs === null || typeof s.turnMs === 'number') && typeof s.mainMs === 'number' && typeof s.burning === 'boolean' && ['ok', 'warning', 'danger'].includes(String(s.status)))
                    && (u === null || (record(u) && typeof u.id === 'string' && seat(u.seat) && uint(u.step) && typeof u.label === 'string' && typeof u.expiresAt === 'number'))
                    && (r === undefined || r === null || (record(r) && typeof r.id === 'string' && typeof r.accepted === 'boolean'));
                break;
            }
            case 'terminal': ok = uint(v.step) && pair(v.returns, x => typeof x === 'number' && Number.isFinite(x)); break;
            case 'events': ok = uint(v.step) && Array.isArray(v.events) && v.events.every(x => record(x) && typeof x.kind === 'string'); break;
            case 'view': {
                const o = v.observation;
                ok = (v.presentationTargets===undefined || (strings(v.presentationTargets) && v.presentationTargets.every(id=>/^(bz-unit-\d+|p[12]-(base|leader))$/.test(id)))) && uint(v.step) && (v.to_move === null || seat(v.to_move)) && (v.actions === undefined || strings(v.actions))
                    && (v.action_values === undefined || (Array.isArray(v.action_values) && strings(v.actions) && v.action_values.length === v.actions.length))
                    && record(o) && (o.revealed_cards == null || (record(o.revealed_cards) && typeof o.revealed_cards.source_name === 'string'
                        && strings(o.revealed_cards.cards) && o.revealed_cards.cards.length > 0
                        && record(o.pending) && o.pending.owner === o.player && o.pending.decision === 'RevealCards' && v.to_move === o.player))
                    && (o.unique_card_name == null || typeof o.unique_card_name === 'string')
                    && (o.leader_deploy_modes == null || (Array.isArray(o.leader_deploy_modes) && (JSON.stringify(o.leader_deploy_modes) === '[0]' || JSON.stringify(o.leader_deploy_modes) === '[0,1]')))
                    && (o.activated_abilities === undefined || (Array.isArray(o.activated_abilities) && o.activated_abilities.every(a=>record(a)
                        && record(a.action) && 'UseAbility' in a.action && typeof a.source_card === 'string' && uint(a.ability_index) && typeof a.has_effect === 'boolean'
                        && o.player === v.to_move && o.pending === null && o.phase === 'Action'
                        && Array.isArray(v.action_values) && v.action_values.some(v=>JSON.stringify(v)===JSON.stringify(a.action)))))
                    && (o.no_effect_plays === undefined || (Array.isArray(o.no_effect_plays) && o.no_effect_plays.every(p => record(p)
                        && record(p.play) && uint(p.play.PlayCard) && typeof p.name === 'string' && (p.negated_by === undefined || typeof p.negated_by === 'string')
                        && o.player === v.to_move && o.pending === null && o.phase === 'Action'
                        && Array.isArray(v.action_values) && v.action_values.some(a=>JSON.stringify(a)===JSON.stringify(p.play)))))
                    && (o.plot_options === undefined || (Array.isArray(o.plot_options) && o.plot_options.every(t=>record(t) && uint(t.index) && uint(t.resource_ix) && typeof t.card==='string' && typeof t.has_effect==='boolean')))
                    && (o.trigger_options === undefined || (Array.isArray(o.trigger_options) && o.trigger_options.every(t=>record(t)
                        && (t.no_effect === undefined || typeof t.no_effect === 'boolean') && uint(t.index) && typeof t.source_card === 'string' && uint(t.ability_index) && (t.keyword === null || t.keyword === 'Ambush' || t.keyword === 'Shielded')
                        && record(o.pending) && (o.pending.decision === 'OrderTriggers' || (record(o.decision_context) && o.decision_context.kind === 'useAbility')) && o.pending.owner === o.player && v.to_move === o.player
                        && Array.isArray(v.action_values) && (t.batch_count === undefined ? v.action_values.some(a=>record(a)&&(record(o.decision_context)&&o.decision_context.kind==='useAbility'?a.ChooseMode===t.index:a.OrderTrigger===t.index)) : uint(t.batch_count) && t.batch_count > 1 && t.keyword === 'Shielded' && v.action_values.length === 2 && [0,1].every(n=>(v.action_values as unknown[]).some(a=>record(a)&&a.ChooseMode===n))))))
                    && (o.event_previews === undefined || (Array.isArray(o.event_previews) && o.event_previews.every(p => record(p)
                        && record(p.play) && uint(p.play.PlayCard) && typeof p.source_card === 'string' && uint(p.ability_index) && uint(p.step)
                        && o.player === v.to_move && o.pending === null && o.phase === 'Action'
                        && Array.isArray(v.action_values) && v.action_values.some(a=>JSON.stringify(a)===JSON.stringify(p.play))
                        && Array.isArray(p.targets) && p.targets.length >= 2 && p.targets.every(a=>record(a)&&record(a.ChooseTarget)
                            && (seat(a.ChooseTarget.Base) || (record(a.ChooseTarget.Unit)&&seat(a.ChooseTarget.Unit.side)&&['Ground','Space'].includes(String(a.ChooseTarget.Unit.arena))&&uint(a.ChooseTarget.Unit.ix)))))))
                    && (o.decision_context == null || (record(o.decision_context)
                        && typeof o.decision_context.source_card === 'string' && /^[A-Z0-9]+[-_]\d+$/.test(o.decision_context.source_card)
                        && uint(o.decision_context.ability_index) && uint(o.decision_context.step)
                        && SCRIPT_DECISION_KINDS.includes(o.decision_context.kind as typeof SCRIPT_DECISION_KINDS[number])
                        && (o.decision_context.disclosure == null || (record(o.decision_context.disclosure) && o.decision_context.kind === 'revealHandCard' && strings(o.decision_context.disclosure.required) && Array.isArray(o.decision_context.disclosure.hand) && o.decision_context.disclosure.hand.every(strings) && o.decision_context.disclosure.hand.length === (o.my_hand as unknown[])?.length && typeof o.decision_context.disclosure.target_name === 'string' && typeof o.decision_context.disclosure.can_satisfy === 'boolean'))
                        && typeof o.decision_context.can_decline === 'boolean'
                        && Array.isArray(v.action_values) && o.decision_context.can_decline === v.action_values.includes('Decline')
                        && (o.decision_context.selection_limit == null || (uint(o.decision_context.selection_limit) && ['takeRevealedCard','playRevealedCard'].includes(String(o.decision_context.kind))))
                        // A frame's peek count outlives the peek: a later hand, resource or discard choice in the same
                        // frame still carries it, so only a choice that answers with deck cards must be covered.
                        && (o.decision_context.peeked_count === undefined || (uint(o.decision_context.peeked_count) && (offDeckChoice(o) || (peekedDeck(o as unknown as Observation, o.decision_context.peeked_count)?.cards.length ?? -1) >= o.decision_context.peeked_count)))
                        && (o.decision_context.target_selection == null || (record(o.decision_context.target_selection) && ['chooseMultipleTargets','playRevealedCard'].includes(String(o.decision_context.kind)) && (o.decision_context.target_selection.budget === null || uint(o.decision_context.target_selection.budget)) && Array.isArray(o.decision_context.target_selection.costs) && o.decision_context.target_selection.costs.every(c=>Array.isArray(c) && c.length===2 && uint(c[1]))))
                        && (o.decision_context.effect_amount == null || (uint(o.decision_context.effect_amount) && (o.decision_context.kind === 'optionalAbility' || o.decision_context.kind === 'selectTarget')))
                        && (o.decision_context.mode_target_name == null || (typeof o.decision_context.mode_target_name === 'string' && o.decision_context.kind === 'chooseMode'))
                        && Array.isArray(o.decision_context.mode_options) && o.decision_context.mode_options.every(x => x === null || typeof x === 'string')
                        && record(o.pending) && o.pending.owner === o.player && v.to_move === o.player
                        && record(o.pending.decision) && record(o.pending.decision.Script) && o.pending.decision.Script.step === o.decision_context.step)) && seat(o.player) && phase(o.phase) && uint(o.round)
                    && seat(o.active) && seat(o.initiative) && (o.initiative_taken === null || seat(o.initiative_taken))
                    && (o.pending_label === null || typeof o.pending_label === 'string') && strings(o.my_hand)
                    && (o.my_hand_types === undefined || (strings(o.my_hand_types) && o.my_hand_types.length === o.my_hand.length))
                    && (o.my_known_top === undefined || strings(o.my_known_top))
                    && (o.my_resource_slots === undefined || (Array.isArray(o.my_resource_slots) && o.my_resource_slots.every(x => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'boolean')))
                    && (o.credits === undefined || pair(o.credits, uint))
                    && (o.base_captured === undefined || pair(o.base_captured,x=>Array.isArray(x)&&x.every(captive)))
                    && (o.base_epic_used === undefined || pair(o.base_epic_used,x=>typeof x==='boolean'))
                    && (o.leader_epic_used === undefined || pair(o.leader_epic_used,x=>typeof x==='boolean'))
                    && (o.resource_exhausted === undefined || pair(o.resource_exhausted,bools))
                    && (o.public_resources === undefined || pair(o.public_resources,x=>Array.isArray(x)&&x.every(c=>Array.isArray(c)&&c.length===2&&uint(c[0])&&typeof c[1]==='string')))
                    && (o.choice_cards === undefined || (Array.isArray(o.choice_cards)&&o.choice_cards.every(c=>record(c)&&uint(c.index)&&typeof c.card==='string'&&seat(c.owner)&&['deck','discard','resources','captives','hand'].includes(String(c.zone)))&&new Set(o.choice_cards.map(c=>(c as {index:number}).index)).size===o.choice_cards.length&&(o.choice_cards.length===0||(record(o.pending)&&o.pending.owner===o.player&&v.to_move===o.player))))
                    && (o.permitted_upgrade_name == null || typeof o.permitted_upgrade_name==='string')
                    && (o.opp_known_top === undefined || strings(o.opp_known_top))
                    && (o.my_bottom_segments === undefined || (Array.isArray(o.my_bottom_segments)&&o.my_bottom_segments.every(strings)))
                    && (o.my_top_seen_by_opponent === undefined || uint(o.my_top_seen_by_opponent))
                    && (o.replacement_prompt == null || (record(o.replacement_prompt)&&(o.replacement_prompt.options===undefined||strings(o.replacement_prompt.options))&&typeof o.replacement_prompt.card==='string'&&typeof o.replacement_prompt.card_name==='string'&&uint(o.replacement_prompt.amount)&&(o.replacement_prompt.token===null||typeof o.replacement_prompt.token==='string')&&(o.replacement_prompt.token_name===null||typeof o.replacement_prompt.token_name==='string')))
                    && (o.has_force === undefined || pair(o.has_force, value => typeof value === 'boolean'))
                    && pair(o.hand_sizes, uint) && pair(o.deck_sizes, uint) && pair(o.base_damage, uint)
                    && pair(o.bases, x => typeof x === 'string') && pair(o.leaders, x => typeof x === 'string')
                    && pair(o.discards, strings) && pair(o.ground, x => Array.isArray(x) && x.every(unit))
                    && pair(o.space, x => Array.isArray(x) && x.every(unit))
                    && pair(o.resources, x => Array.isArray(x) && x.length === 2 && x.every(y => record(y) && uint(y.count) && typeof y.name === 'string' && (y.text === null || typeof y.text === 'string')));
                break;
            }
        }
    }
    return ok;
}
