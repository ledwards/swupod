// @ts-nocheck
/**
 * Leader Power Rankings for Limited/Draft Play
 *
 * Default fallback rankings based on real human draft data from production.
 * Updated 2026-03-12 from dev database pick frequency stats.
 *
 * These are used as fallback when the data-driven behavior can't load
 * live stats from the database (< 5 completed drafts for a set).
 * When live data IS available, the DataDrivenBehavior ranks by
 * overall pick count (timesPicked) from the DB instead.
 */

export const LEADER_RANKINGS: Record<string, string[]> = {
  // Rankings based on real human draft data from production (pick frequency)
  // Updated 2026-03-12

  SOR: [
    'Boba Fett',          // Most picked overall
    'IG-88',              // Tied for most picks
    'Sabine Wren',        // Strong aggro
    'Chewbacca',          // Solid vigilance
    'Director Krennic',   // Vigilance/villainy
    'Leia Organa',        // Command/heroism
    'Grand Moff Tarkin',  // Straightforward value
    'Iden Versio',        // Vigilance/villainy
    'Chirrut Îmwe',       // Vigilance/heroism
    'Jyn Erso',           // Cunning/heroism
    'Cassian Andor',      // Aggression/heroism
    'Grand Admiral Thrawn', // Cunning/villainy
    'Darth Vader',        // Aggression/villainy
    'Han Solo',           // Cunning/heroism
    'Luke Skywalker',     // Vigilance/heroism
    'Hera Syndulla',      // Command/heroism
    'Grand Inquisitor',   // Aggression/villainy
    'Emperor Palpatine',  // Command/villainy
  ],

  SHD: [
    'Fennec Shand',       // Most popular pick
    'Cad Bane',           // Strong limited, Underworld synergy
    'Gar Saxon',          // Vigilance/villainy
    'Hondo Ohnaka',       // Command/villainy
    'Boba Fett',          // Command/heroism
    'Qi\'ra',             // Vigilance/villainy
    'Rey',                // Vigilance/heroism
    'Kylo Ren',           // Aggression/villainy
    'Han Solo',           // Aggression/heroism
    'Bossk',              // Bounties mechanic
    'Bo-Katan Kryze',     // Aggression/heroism
    'Jabba the Hutt',     // Command/villainy
    'Finn',               // Vigilance/heroism
    'Doctor Aphra',       // Cunning/villainy
    'Lando Calrissian',   // Cunning/heroism
    'Hunter',             // Command/heroism
  ],

  TWI: [
    'Maul',               // Most picked, strong aggro
    'Obi-Wan Kenobi',     // Solid vigilance/heroism
    'Nute Gunray',        // Surprisingly popular in limited
    'Anakin Skywalker',   // Units trade up
    'Jango Fett',         // Cunning/villainy
    'Padmé Amidala',      // Command/heroism
    'Quinlan Vos',        // Clear upgrade on deployment
    'Count Dooku',        // Command/villainy
    'Mace Windu',         // Aggression/heroism
    'Yoda',               // Vigilance/heroism
    'Asajj Ventress',     // Cunning/villainy
    'Nala Se',            // Vigilance/villainy
    'Wat Tambor',         // Command/villainy
    'Ahsoka Tano',        // Aggression/heroism
    'Captain Rex',        // Command/heroism
    'General Grievous',   // Cunning/villainy
    'Pre Vizsla',         // Aggression/villainy
    'Chancellor Palpatine', // Complex but powerful
  ],

  JTL: [
    'Admiral Ackbar',     // Tied for most picks
    'Major Vonreg',       // Tied for most picks
    'Luke Skywalker',     // Tied for most picks
    'Grand Admiral Thrawn', // Strong limited pick
    'Darth Vader',        // Command/villainy
    'Rio Durant',         // Cunning/villainy
    'Wedge Antilles',     // Command/heroism
    'Rose Tico',          // Vigilance/heroism
    'Asajj Ventress',     // Vigilance/villainy
    'Admiral Holdo',      // Command/heroism
    'Admiral Piett',      // Command/villainy
    'Kazuda Xiono',       // Cunning/heroism
    'Admiral Trench',     // Cunning/villainy
    'Poe Dameron',        // Aggression/heroism
    'Han Solo',           // Cunning/heroism
    'Lando Calrissian',   // Vigilance/heroism
    'Boba Fett',          // Aggression/villainy
    'Captain Phasma',     // Aggression/villainy
  ],

  LOF: [
    'Obi-Wan Kenobi',     // Most picked
    'Mother Talzin',      // Tied for most picks
    'Third Sister',       // Aggression/villainy
    'Supreme Leader Snoke', // Command/villainy
    'Grand Inquisitor',   // Cunning/villainy
    'Kit Fisto',          // Aggression/heroism
    'Rey',                // Aggression/heroism
    'Darth Maul',         // Aggression/villainy
    'Ahsoka Tano',        // Vigilance/heroism
    'Kylo Ren',           // Vigilance/villainy
    'Morgan Elsbeth',     // Command/villainy
    'Avar Kriss',         // Command/heroism
    'Barriss Offee',      // Cunning/villainy
    'Anakin Skywalker',   // Heroism only
    'Darth Revan',        // Villainy only
    'Cal Kestis',         // Cunning/heroism
    'Kanan Jarrus',       // Vigilance/heroism
    'Qui-Gon Jinn',       // Cunning/heroism
  ],

  SEC: [
    'Dedra Meero',        // Most picked overall
    'Colonel Yularen',    // Command/villainy powerhouse
    'Jabba the Hutt',     // Vigilance/villainy
    'Luthen Rael',        // Aggression/heroism
    'Mon Mothma',         // Command/heroism
    'Leia Organa',        // Vigilance/heroism
    'C-3PO',              // Cunning/heroism
    'Sly Moore',          // Cunning/villainy
    'Sabé',               // Cunning/heroism
    'Lama Su',            // Vigilance/villainy
    'Governor Pryce',     // Aggression/villainy
    'Dryden Vos',         // Command/villainy
    'DJ',                 // Cunning/cunning
    'Satine Kryze',       // Vigilance/heroism
    'Cassian Andor',      // Aggression/heroism
    'Bail Organa',        // Command/heroism
    'Padmé Amidala',      // Cunning/heroism
    'Chancellor Palpatine', // Vigilance/villainy
    'Fennec Shand',       // Cunning/heroism
  ],

  LAW: [
    'Enfys Nest',         // Most popular, 83 picks
    'Aurra Sing',         // 82 picks, strong aggro
    'Vel Sartha',         // 79 picks
    'Boba Fett',          // 77 picks, high first-pick rate
    'Hera Syndulla',      // 75 picks
    'The Client',         // 52 picks
    'Darth Vader',        // 36 picks
    'Lando Calrissian',   // 25 picks
    'Han Solo',           // 20 picks
    'Agent Kallus',       // 17 picks
    'Sebulba',            // 17 picks
    'Director Krennic',   // 15 picks
    'Saw Gerrera',        // 15 picks
    'Tobias Beckett',     // 13 picks
    'Chewbacca',          // 9 picks
    'Jyn Erso',           // 9 picks
  ],
}

export default LEADER_RANKINGS
