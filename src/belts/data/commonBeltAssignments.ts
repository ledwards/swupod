// @ts-nocheck
/**
 * Common Belt Assignments
 *
 * Static mapping of common cards to belts A or B for each set.
 * This file is designed to be easily editable by hand.
 *
 * CRITICAL RULES:
 * - No card should appear in both belts for the same set
 * - Belt sizes must match the targets (see block definitions below)
 * - Color proximity rules are enforced by the belt drawing logic
 *
 * BLOCK DEFINITIONS:
 *
 * Block 0 (Sets 1-3: SOR, SHD, TWI):
 * - Belt A: Blue (Vigilance), Green (Command), Red (Aggression) - 60 cards
 * - Belt B: Yellow (Cunning), Villainy, Heroism, Neutral - 30 cards
 * - Belt A fills common slots 1-6 (6 cards per pack)
 * - Belt B fills common slots 7-9 (3 cards per pack)
 * - Hyperspace upgrades happen in slot 6
 *
 * Block A (Sets 4-6: JTL, LOF, SEC):
 * - Belt A: BGV (Blue/Vigilance, Green/Command, Villainy) - 50 cards
 * - Belt B: RYHN (Red/Aggression, Yellow/Cunning, Heroism, Neutral) - 50 cards
 * - Belt A fills common slots 1-4 (4 cards per pack)
 * - Slot 5 alternates between Belt A and Belt B
 * - Belt B fills common slots 6-9 (4 cards per pack)
 * - Hyperspace upgrades happen in slot 4
 *
 * Block B (Sets 7+: LAW) — verified from physical pack openings:
 * - 50/50 split
 * - Belt A: Vigilance first, Aggression first, Villainy-only, Heroism-only - 50 cards
 * - Belt B: Cunning first, Command first, Neutral (no aspects) - 50 cards
 * - Belt A fills common slots 1-4 (4 cards per pack)
 * - Slot 5 is a DEDICATED Hyperspace common from HyperspaceCommonBelt (not from Belt A/B)
 * - Belt B fills common slots 6-9 (4 cards per pack)
 * - No alternating slot (slot 5 is always HS)
 * - One card override: Hidden Hand Supplier (neutral) goes to Belt A
 * - Double/triple-aspect cards assigned by first-listed aspect
 *
 * To edit: Simply add or remove card names from the arrays below.
 * Run the test suite after editing to verify no duplicates and correct sizes.
 */

import type { SetCode } from '../../types'
import type { RawCard } from '../../utils/cardData'

type BlockType = 0 | 'A' | 'B'

interface BeltConfig {
  beltASlots: number
  beltBSlots: number
  alternatingSlot: number | null
  hyperspaceSlot: number
  targetBeltASize: number
  targetBeltBSize: number
  guaranteedHyperspace?: boolean
}

interface SetBeltAssignment {
  beltA: string[]
  beltB: string[]
  autoAssign?: boolean
}

export const COMMON_BELT_ASSIGNMENTS: Record<string, SetBeltAssignment> = {
  "SOR": {
    "beltA": [
      "Vanguard Infantry",
      "Patrolling V-Wing",
      "Consortium StarViper",
      "Homestead Militia",
      "Escort Skiff",
      "Steadfast Battalion",
      "Mercenary Company",
      "Academy Training",
      "Recruit",
      "Tactical Advantage",
      "Resupply",
      "Strike True",
      "Death Star Stormtrooper",
      "First Legion Snowtrooper",
      "Imperial Interceptor",
      "SpecForce Soldier",
      "Green Squadron A-Wing",
      "Guerilla Attack Pod",
      "Cantina Braggart",
      "Jedha Agitator",
      "Partisan Insurgent",
      "Ardent Sympathizer",
      "Disabling Fang Fighter",
      "Wampa",
      "Occupier Siege Tank",
      "Infiltrator's Skill",
      "Precision Fire",
      "Keep Fighting",
      "Mission Briefing",
      "Open Fire",
      "Scout Bike Pursuer",
      "Death Trooper",
      "Academy Defense Walker",
      "Restored ARC-170",
      "Consular Security Force",
      "Vigilant Honor Guards",
      "2-1B Surgical Droid",
      "Guardian of the Whills",
      "Cloud City Wing Guard",
      "Wilderness Fighter",
      "System Patrol Craft",
      "Rugged Survivors",
      "Cargo Juggernaut",
      "Resilient",
      "Moment of Peace",
      "Repair",
      "Make an Opening",
      "Vanquish",
      "Seasoned Shoretrooper",
      "Superlaser Technician",
      "Gladiator Star Destroyer",
      "Alliance Dispatcher",
      "Battlefield Marine",
      "Echo Base Defender",
      "Restock",
      "Confiscate",
      "Corellian Freighter",
      "Frontier AT-RT",
      "Volunteer Soldier",
      "Underworld Thug"
    ],
    "beltB": [
      "ISB Agent",
      "Seventh Fleet Defender",
      "Bounty Hunter Crew",
      "Lothal Insurgent",
      "Rogue Operative",
      "Auzituck Liberator Gunship",
      "Jawa Scavenger",
      "Mining Guild TIE Fighter",
      "Crafty Smuggler",
      "Outer Rim Headhunter",
      "Swoop Racer",
      "Gamorrean Guards",
      "Syndicate Lackeys",
      "Snapshot Reflexes",
      "Disarm",
      "Asteroid Sanctuary",
      "Surprise Strike",
      "Waylay",
      "TIE/ln Fighter",
      "Snowtrooper Lieutenant",
      "Viper Probe Droid",
      "Cell Block Guard",
      "AT-ST",
      "Maximum Firepower",
      "Alliance X-Wing",
      "Rebel Pathfinder",
      "Fleet Lieutenant",
      "Regional Sympathizers",
      "Snowspeeder",
      "Medal Ceremony"
    ]
  },
  "SHD": {
    "beltA": [
      "Modded Cohort",
      "Adelphi Patrol Wing",
      "Warzone Lieutenant",
      "Collections Starhopper",
      "Gamorrean Retainer",
      "Outlaw Corona",
      "Reputable Hunter",
      "Weequay Pirate Gang",
      "Discerning Veteran",
      "Mercenary Company",
      "Price on Your Head",
      "Outflank",
      "Timely Intervention",
      "Moment of Glory",
      "Take Captive",
      "Guavian Antagonizer",
      "Death Watch Loyalist",
      "Trandoshan Hunters",
      "Heroic Renegade",
      "Nite Owl Skirmisher",
      "Desperado Freighter",
      "Reckless Gunslinger",
      "House Kast Soldier",
      "Rhokai Gunship",
      "Disabling Fang Fighter",
      "Wanted Insurgents",
      "Hunting Nexu",
      "Clan Challengers",
      "Covetous Rivals",
      "Death Mark",
      "Daring Raid",
      "Desperate Attack",
      "Detention Block Rescue",
      "Pillage",
      "Hylobon Enforcer",
      "Pyke Sentinel",
      "Supercommando Squad",
      "Clan Wren Rescuer",
      "Village Protectors",
      "Gentle Giant",
      "Moisture Farmer",
      "Follower of The Way",
      "Rickety Quadjumper",
      "HWK-290 Freighter",
      "Wroshyr Tree Tender",
      "Niima Outpost Constables",
      "Vigilant Pursuit Craft",
      "Cargo Juggernaut",
      "Public Enemy",
      "Foundling",
      "Vambrace Grappleshot",
      "Covert Strength",
      "Rival's Fall",
      "Outland TIE Vanguard",
      "Warbird Stowaway",
      "Pirate Battle Tank",
      "Clone Deserter",
      "Rich Reward",
      "Street Gang Recruiter",
      "Twin Pod Cloud Car"
    ],
    "beltB": [
      "Kintan Intimidator",
      "Hunter of the Haxion Brood",
      "Slaver's Freighter",
      "Cartel Turncoat",
      "Liberated Slaves",
      "Principled Outlaw",
      "Criminal Muscle",
      "Cloud-Rider",
      "Fugitive Wookiee",
      "Privateer Scyk",
      "Frontier Trader",
      "Smuggler's Starfighter",
      "Chain Code Collector",
      "Resourceful Pursuers",
      "Wanted",
      "Look the Other Way",
      "Ma Klounkee",
      "Surprise Strike",
      "Relentless Pursuit",
      "Ruthless Assassin",
      "Black Sun Starfighter",
      "Hutt's Henchmen",
      "No Bargain",
      "Grey Squadron Y-Wing",
      "Protector of the Throne",
      "Wookiee Warrior",
      "Smuggler's Aid",
      "Bounty Guild Initiate",
      "Underworld Thug",
      "Mandalorian Warrior"
    ]
  },
  "TWI": {
    "beltA": [
      "Obedient Vanguard",
      "Coruscant Guard",
      "Ryloth Militia",
      "501st Liberator",
      "Republic ARC-170",
      "Subjugating Starfighter",
      "B2 Legionnaires",
      "Baktoid Spider Droid",
      "Strategic Acumen",
      "Encouraging Leadership",
      "Resupply",
      "Take Captive",
      "OOM-Series Officer",
      "B1 Attack Platform",
      "Squadron of Vultures",
      "Soldier of the 501st",
      "Batch Brothers",
      "Senatorial Corvette",
      "Clone Heavy Gunner",
      "Dendup's Loyalist",
      "Vanguard Droid Bomber",
      "Bold Recon Commando",
      "Reckless Torrent",
      "Relentless Rocket Droid",
      "Heavy Persuader Tank",
      "Old Access Codes",
      "Daring Raid",
      "Grenade Strike",
      "Grim Resolve",
      "Strategic Analysis",
      "Wartime Trade Official",
      "Devastating Gunship",
      "Droideka Security",
      "Outspoken Representative",
      "41st Elite Corps",
      "Knight of the Republic",
      "Warrior Drone",
      "Padawan Starfighter",
      "Royal Guard Attaché",
      "Trade Federation Shuttle",
      "Infantry of the 212th",
      "Daughter of Dathomir",
      "Falchion Ion Tank",
      "Multi-Troop Transport",
      "Perilous Position",
      "Grievous Reassembly",
      "Guarding the Way",
      "Vanquish",
      "Confederate Courier",
      "Droid Commando",
      "Separatist Super Tank",
      "Republic Tactical Officer",
      "Advanced Recon Commando",
      "Pelta Supply Frigate",
      "Hold-Out Blaster",
      "Volunteer Soldier",
      "Headhunter Squadron",
      "Aggrieved Parliamentarian",
      "Drop In",
      "Heroes on Both Sides"
    ],
    "beltB": [
      "Elite P-38 Starfighter",
      "Infiltrating Demolisher",
      "On the Doorstep",
      "Wolf Pack Escort",
      "Republic Attack Pod",
      "Creative Thinking",
      "Clone Dive Trooper",
      "B1 Security Team",
      "Favorable Delegate",
      "Hotshot V-Wing",
      "Freelance Assassin",
      "Hidden Sharpshooter",
      "Geonosis Patrol Fighter",
      "Tri-Droid Suppressor",
      "Droid Cohort",
      "In Pursuit",
      "Political Pressure",
      "Breaking In",
      "Droid Starfighter",
      "Super Battle Droid",
      "Dwarf Spider Droid",
      "Patrolling AAT",
      "Hailfire Tank",
      "Droid Deployment",
      "Merciless Contest",
      "Phase I Clone Trooper",
      "Phase II Clone Trooper",
      "Republic Commando",
      "Eta-2 Light Interceptor",
      "Armored Saber Tank"
    ]
  },
  "JTL": {
    "beltA": [
      "Resistance Blue Squadron",
      "Bunker Defender",
      "Clone Pilot",
      "Scouting Headhunter",
      "Eager Escort Fighter",
      "Homestead Militia",
      "Adept ARC-170",
      "MC30 Assault Frigate",
      "Resupply Carrier",
      "Dorsal Turret",
      "All Wings Report In",
      "Tandem Assault",
      "Air Superiority",
      "Prepare for Takeoff",
      "Focus Fire",
      "Indoctrinated Conscript",
      "TIE Bomber",
      "Sith Trooper",
      "TIE Dagger Vanguard",
      "Rogue-class Starfighter",
      "Quasar TIE Carrier",
      "Onyx Squadron Brute",
      "Interceptor Ace",
      "Fleet Interdictor",
      "Echo Base Engineer",
      "Red Squadron X-Wing",
      "D'Qar Cargo Frigate",
      "Academy Graduate",
      "Desperate Commando",
      "Royal Security Fighter",
      "Landing Shuttle",
      "Omicron Strike Craft",
      "Outer Rim Outlaws",
      "Cloaked StarViper",
      "Perimeter AT-RT",
      "Munificent Frigate",
      "CR90 Relief Runner",
      "Repair",
      "Covering the Wing",
      "Direct Hit",
      "Out the Airlock",
      "First Order TIE Fighter",
      "Kijimi Patrollers",
      "TIE Ambush Squadron",
      "Phoenix Squadron A-Wing",
      "Veteran Fleet Officer",
      "Hopeful Volunteer",
      "Coordinated Front",
      "Evasive Maneuver"
    ],
    "beltB": [
      "First Order Stormtrooper",
      "Special Forces TIE Fighter",
      "Prototype TIE Advanced",
      "Massassi Tactical Officer",
      "Red Squadron Y-Wing",
      "Rebellious Hammerhead",
      "Crackshot V-Wing",
      "Determined Recruit",
      "Supporting Eta-2",
      "Droid Missile Platform",
      "AT-DP Occupier",
      "Orbiting K-Wing",
      "Occupier Siege Tank",
      "Insurgent Saboteurs",
      "Twin Laser Turret",
      "Fight Fire With Fire",
      "System Shock",
      "Shoot Down",
      "Koiogran Turn",
      "Piercing Shot",
      "Zygerrian Starhopper",
      "Contracted Jumpmaster",
      "Techno Union Transport",
      "Dagger Squadron Pilot",
      "Blade Squadron B-Wing",
      "Black Squadron Scout Wing",
      "Independent Smuggler",
      "Republic Y-Wing",
      "X-34 Landspeeder",
      "Death Space Skirmisher",
      "Guerilla Soldier",
      "Skyway Cloud Car",
      "Kimogila Heavy Fighter",
      "Shadowed Hover Tank",
      "Corporate Light Cruiser",
      "Barrel Roll",
      "Diversion",
      "Electromagnetic Pulse",
      "Punch It",
      "Torpedo Barrage",
      "Resistance X-Wing",
      "Dilapidated Ski Speeder",
      "Jedi Light Cruiser",
      "Dedicated Wingmen",
      "Sullustan Spacer",
      "Swarming Vulture Droid",
      "Flanking Fang Fighter",
      "Corellian Freighter",
      "Attack Run"
    ]
  },
  "LOF": {
    "beltA": [
      "Following the Path",
      "Village Tender",
      "Mynock",
      "Hive Defense Wing",
      "Outer Rim Mystic",
      "Jedi Temple Guards",
      "Kaadu",
      "Relic Scavenger",
      "Terentatek",
      "Hyperspace Wayfarer",
      "Trident Assault Ship",
      "Overpower",
      "Protect the Pod",
      "Forged Starfighter",
      "Fallen Jedi",
      "Sandtrooper Cavalry",
      "Army of the Dead",
      "Consumed by the Dark Side",
      "In the Shadows",
      "Magistrate's Scout",
      "Supremacy TIE/sf",
      "Talzin's Assassin",
      "Drain Essence",
      "Loth-Wolf",
      "Itinerant Warrior",
      "Jedi Guardian",
      "Heirloom Lightsaber",
      "Guardian of the Whills",
      "Nightsister Warrior",
      "Padawan Starfighter",
      "Secretive Sage",
      "Tauntaun",
      "Awakened Specters",
      "Graceful Purrgil",
      "Grappling Guardian",
      "Bolstered Endurance",
      "Cure Wounds",
      "Crushing Blow",
      "Whirlwind of Power",
      "Exegol Patroller",
      "Knight of Ren",
      "Praetorian Guard",
      "Inquisitor's Lightsaber",
      "Point Rain Reclaimer",
      "Jedi Consular",
      "Paladin Training Corvette",
      "Curious Flock",
      "It's Worse",
      "Porg",
      "Vulptex"
    ],
    "beltB": [
      "Acolyte of the Beyond",
      "Strikeship",
      "Purge Trooper",
      "Thralls of the Coven",
      "Attuned Fyrnock",
      "Jedi Starfighter",
      "Jedi Knight",
      "Knight's Saber",
      "Witch of the Mist",
      "DRK-1 Probe Droid",
      "Cartel Interceptor",
      "Hyena Bomber",
      "Jedi In Hiding",
      "Tuk'ata",
      "Hunting Nexu",
      "Wampa",
      "Ravenous Rathtar",
      "Sorcerous Blast",
      "Unleash Rage",
      "Do or Do Not",
      "Adept of Anger",
      "Banking Clan Shuttle",
      "Nihil Marauder",
      "Corrupted Saber",
      "N-1 Starfighter",
      "Youngling Padawan",
      "J-Type Nubian Starship",
      "Jedi Sentinel",
      "Loth-Cat",
      "Mysterious Hermit",
      "Tusken Tracker",
      "Charging Phillak",
      "Life Wind Sage",
      "Sorcerers of Tund",
      "Ascension Cable",
      "Disturbance in the Force",
      "Force Slow",
      "Pounce",
      "Tip the Scale",
      "The Will of the Force",
      "Refugee of The Path",
      "Gungan Warrior",
      "Medical Frigate",
      "Blue Squadron Assault Wing",
      "Longbeam Cruiser",
      "Gifted Urchin",
      "Kowakian Monkey-Lizard",
      "Ravening Gundark",
      "Go Into Hiding",
      "Last Words"
    ]
  },
  "SEC": {
    "beltA": [
      "Dressellian Commandos",
      "Senator's Aide",
      "Diplomatic Envoy",
      "GNK Power Droid",
      "Daro Commando",
      "Nubian Star Skiff",
      "Consular's Cruiser",
      "Raxian Assembly",
      "Naboo Security Force",
      "Shadow Crawler",
      "Unveiled Might",
      "Budget Scheming",
      "Reconnaissance",
      "With Thunderous Applause",
      "Ferrix Uprising",
      "Supreme Council Aide",
      "Sith Assassin",
      "Viper Probe Droid",
      "Hutt Cartel Starfighter",
      "Political Bully",
      "FN Trooper Corps",
      "Contempt for Culture",
      "Trayus Acolyte",
      "Death Trooper",
      "Dogmatic Shock Squad",
      "Chandrilan Sponsor",
      "Populist Champion",
      "Jade Squadron Patrol",
      "Dhani Pilgrim",
      "Lost Jedi",
      "Senate Warden",
      "Defense Fleet X-Wing",
      "Bardottan Ornithopter",
      "Rotunda Senate Guards",
      "Congress of Malastare",
      "Alderaanian Envoys",
      "Nimble Prowess",
      "Armor of Fortune",
      "Scour the Archives",
      "Relief Request",
      "Knowledge and Defense",
      "Retaliation",
      "Imperial Dark Trooper",
      "ISB Shuttle",
      "Cruel Commandos",
      "Theed Security",
      "Beloved Orator",
      "Inspiring Senator",
      "Rebel Pathfinder",
      "High Command Councilor"
    ],
    "beltB": [
      "Imperial Occupier",
      "Hunting Assassin Droid",
      "Enforcer Squadron",
      "Rebellious Functionary",
      "Strike Force X-Wing",
      "Inner Rim Coalition",
      "Reckless Rebel",
      "Contraband Starhopper",
      "Outer Rim Constable",
      "Warrior of Clan Ordo",
      "Academy Disciplinarian",
      "Republic Aurek Starfighter",
      "Coruscant Undercity Police",
      "Corellian Hounds",
      "Republic War Walker",
      "Ambition's Reward",
      "Sudden Ferocity",
      "Pursue the Lead",
      "Let's Call It War",
      "Unauthorized Investigation",
      "ISB Agent",
      "Lurking Snub Fighter",
      "Trade Federation Delegates",
      "Bravo Squadron Fighter",
      "Junior Senator",
      "Emissaries from Ryloth",
      "A-Wing",
      "Skyhopper Canyon Runner",
      "Emissary's Sheathipede",
      "Regulations Bureaucrat",
      "Zenuas Shadow Fighter",
      "Unruly Astromech",
      "Loan Shark",
      "Duchess's Investigators",
      "Sneaking Suspicion",
      "Accelerate Our Plans",
      "Catch Unawares",
      "Kreia's Whispers",
      "Beguile",
      "Bog Down in Procedure",
      "Crait Veteran",
      "Covert Operative",
      "Heroic ARC-170",
      "Remote Escort Tank",
      "Grassroots Resistance",
      "ASP Laborer",
      "Inspector's Shuttle",
      "Ando Commission",
      "Assassin Probe",
      "Clandestine Connections"
    ]
  },
  // LAW (Set 7) - Belt assignments TBD
  // Triple-aspect cards are assigned using the assignTripleAspectCard helper
  // For now, use auto-assignment based on aspects until static assignments are created
  "LAW": {
    "beltA": [],
    "beltB": [],
    "autoAssign": true  // Flag to use aspect-based auto-assignment
  },
  // ASH (Set 8) - Same block B auto-assignment as LAW
  "ASH": {
    "beltA": [],
    "beltB": [],
    "autoAssign": true
  }
}

/**
 * Get the block number for a set code
 * Block 0: Sets 1-3 (SOR, SHD, TWI)
 * Block A: Sets 4-6 (JTL, LOF, SEC)
 * Block B: Sets 7+ (LAW, etc.)
 */
export function getBlockForSet(setCode: SetCode | string): BlockType {
  const block0Sets = ['SOR', 'SHD', 'TWI']
  const blockASets = ['JTL', 'LOF', 'SEC']
  const blockBSets = ['LAW', 'ASH']

  if (block0Sets.includes(setCode)) return 0
  if (blockASets.includes(setCode)) return 'A'
  if (blockBSets.includes(setCode)) return 'B'
  return 'B' // Default to Block B for future sets
}

/**
 * Get belt configuration for a block
 */
export function getBeltConfig(block: BlockType): BeltConfig {
  if (block === 0) {
    return {
      beltASlots: 6,  // Slots 1-6
      beltBSlots: 3,  // Slots 7-9
      alternatingSlot: null,
      hyperspaceSlot: 6,  // 1-indexed
      targetBeltASize: 60,
      targetBeltBSize: 30,
    }
  } else if (block === 'A') {
    return {
      beltASlots: 4,  // Slots 1-4
      beltBSlots: 4,  // Slots 6-9
      alternatingSlot: 5,  // Slot 5 alternates
      hyperspaceSlot: 4,  // 1-indexed
      targetBeltASize: 50,
      targetBeltBSize: 50,
    }
  } else {
    // Block B (LAW+) - Slot 5 is a dedicated HS common from HyperspaceCommonBelt
    // Belt A fills slots 1-4, Belt B fills slots 6-9
    // No alternating slot — slot 5 is always from the HS common belt
    return {
      beltASlots: 4,  // Slots 1-4
      beltBSlots: 4,  // Slots 6-9
      alternatingSlot: null,  // No alternating — slot 5 is dedicated HS common
      hyperspaceSlot: 5,  // Slot 5 is dedicated HS common (from HyperspaceCommonBelt)
      targetBeltASize: 50,
      targetBeltBSize: 50,
    }
  }
}

/**
 * Cards that are exceptions to the aspect-based belt assignment rules.
 * Verified from physical pack openings.
 */
const BELT_OVERRIDES: Record<string, Record<string, 'A' | 'B'>> = {
  // LAW: Hidden Hand Supplier is neutral (no aspects) but goes on Belt A
  'LAW': {
    'Hidden Hand Supplier': 'A',
  },
  // ASH: physical box openings show the mono-H cards on Belt B, with neutral
  // cards split 3/3 to keep the Block B common belts at 50/50.
  'ASH': {
    'Covert Veteran': 'B',
    'Imperial Defector': 'B',
    'Zealous Soldier': 'B',
    'N5 Sentry Droid': 'B',
    'Gallofree Transport': 'B',
    'Rebel Infiltrators': 'B',
    'Grassroots Resistance': 'B',
    'LEP Ratcatcher': 'A',
    'Mos Espa Watermonger': 'A',
    'Noti Mobile Pod': 'A',
    'Faith in the Empire': 'B',
    "The Way of the Mand'alor": 'B',
    'A New Order': 'B',
  },
}

/**
 * Determine which belt a card should be assigned to based on its aspects.
 * Used for auto-assignment of cards (LAW+ sets).
 *
 * Rules verified from physical LAW pack openings:
 *
 * Block 0 (SOR, SHD, TWI):
 *   Belt A: Vigilance, Command, Aggression (first aspect)
 *   Belt B: Cunning, Villainy, Heroism, Neutral
 *
 * Block A (JTL, LOF, SEC):
 *   Belt A: Vigilance, Command, Villainy (first aspect)
 *   Belt B: Aggression, Cunning, Heroism, Neutral
 *
 * Block B (LAW+) — verified from physical packs:
 *   Belt A: Vigilance first aspect, Aggression first aspect,
 *           Villainy-only, Heroism-only, + per-card overrides
 *   Belt B: Cunning first aspect, Command first aspect,
 *           Neutral (no aspects), - per-card overrides
 *
 * @param card - Card object with aspects array
 * @param block - Block identifier ('0', 'A', or 'B')
 * @returns 'A' or 'B'
 */
export function assignCardToBelt(card: RawCard, block: BlockType): 'A' | 'B' {
  const aspects = card.aspects || []

  // Check per-card overrides first
  const setCode = card.set || ''
  if (BELT_OVERRIDES[setCode] && BELT_OVERRIDES[setCode][card.name]) {
    return BELT_OVERRIDES[setCode][card.name]
  }

  if (block === 0) {
    // Block 0: Belt A = Blue, Green, Red
    const beltAAspects = ['Vigilance', 'Command', 'Aggression']
    if (aspects.length > 0 && beltAAspects.includes(aspects[0])) {
      return 'A'
    }
    return 'B'
  }

  if (block === 'A') {
    // Block A: Belt A = Blue, Green, Villainy (first aspect)
    const beltAAspects = ['Vigilance', 'Command', 'Villainy']
    if (aspects.length > 0 && beltAAspects.includes(aspects[0])) {
      return 'A'
    }
    return 'B'
  }

  // Block B (LAW+) — verified from physical pack openings:
  // Belt A: Vigilance first, Aggression first, Villainy-only, Heroism-only
  // Belt B: Cunning first, Command first, Neutral (no aspects)
  const firstAspect = aspects[0]

  // Blue (Vigilance) or Red (Aggression) as first aspect → Belt A
  if (firstAspect === 'Vigilance' || firstAspect === 'Aggression') {
    return 'A'
  }

  // Mono-aspect Villainy or Heroism → Belt A
  if (aspects.length === 1 && (firstAspect === 'Villainy' || firstAspect === 'Heroism')) {
    return 'A'
  }

  // Yellow (Cunning) or Green (Command) as first aspect → Belt B
  if (firstAspect === 'Cunning' || firstAspect === 'Command') {
    return 'B'
  }

  // Neutral (no aspects) → Belt B
  if (aspects.length === 0) {
    return 'B'
  }

  // Fallback for any edge cases
  return 'B'
}

/**
 * Check if a card is a triple-aspect card (has 3+ aspects)
 * @param card - Card object with aspects array
 * @returns boolean
 */
export function isTripleAspectCard(card: RawCard): boolean {
  return (card.aspects || []).length >= 3
}
