const fs = require('fs');
const data = require('../src/data/cards.json');
const cards = data.cards;

function hasAspect(card, aspect) {
  return card.aspects && card.aspects.includes(aspect);
}

function isMonoAspect(card, aspect) {
  return card.aspects && card.aspects.length === 1 && card.aspects[0] === aspect;
}

function isNeutral(card) {
  return !card.aspects || card.aspects.length === 0;
}

function getCommons(setCode) {
  return cards.filter(c =>
    c.set === setCode &&
    c.variantType === 'Normal' &&
    c.rarity === 'Common' &&
    c.type !== 'Leader' &&
    c.type !== 'Base'
  );
}

function shuffle(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function assignBlock0(setCode) {
  const commons = getCommons(setCode);
  const beltA = [];
  const beltB = [];

  commons.forEach(card => {
    if (hasAspect(card, 'Vigilance') || hasAspect(card, 'Command') || hasAspect(card, 'Aggression')) {
      if (hasAspect(card, 'Cunning')) {
        beltB.push(card);
      } else {
        beltA.push(card);
      }
    } else if (hasAspect(card, 'Cunning') || hasAspect(card, 'Villainy') || hasAspect(card, 'Heroism') || isNeutral(card)) {
      beltB.push(card);
    } else {
      beltB.push(card);
    }
  });

  const targetA = 60;
  const targetB = 30;

  const flexibleInA = beltA.filter(c => isMonoAspect(c, 'Villainy') || isMonoAspect(c, 'Heroism') || isNeutral(c));
  const flexibleInB = beltB.filter(c => isMonoAspect(c, 'Villainy') || isMonoAspect(c, 'Heroism') || isNeutral(c));

  while (beltA.length > targetA && flexibleInA.length > 0) {
    const card = flexibleInA.pop();
    const idx = beltA.findIndex(c => c.id === card.id);
    if (idx >= 0) {
      beltA.splice(idx, 1);
      beltB.push(card);
    }
  }

  while (beltB.length > targetB && flexibleInB.length > 0) {
    const card = flexibleInB.pop();
    const idx = beltB.findIndex(c => c.id === card.id);
    if (idx >= 0) {
      beltB.splice(idx, 1);
      beltA.push(card);
    }
  }

  console.log(`${setCode}: Belt A = ${beltA.length}, Belt B = ${beltB.length}`);
  return { beltA: beltA.map(c => c.name), beltB: beltB.map(c => c.name) };
}

function assignBlockA(setCode) {
  const commons = getCommons(setCode);
  const total = commons.length;
  const beltA = [];
  const beltB = [];
  const flexible = [];

  commons.forEach(card => {
    const hasVig = hasAspect(card, 'Vigilance');
    const hasCmd = hasAspect(card, 'Command');
    const hasAgg = hasAspect(card, 'Aggression');
    const hasCun = hasAspect(card, 'Cunning');
    const hasVil = hasAspect(card, 'Villainy');
    const hasHer = hasAspect(card, 'Heroism');
    const neutral = isNeutral(card);

    if (isMonoAspect(card, 'Villainy')) {
      beltA.push(card);
      flexible.push({ card, currentBelt: 'A' });
    } else if (isMonoAspect(card, 'Heroism')) {
      beltB.push(card);
      flexible.push({ card, currentBelt: 'B' });
    } else if (neutral) {
      beltB.push(card);
      flexible.push({ card, currentBelt: 'B' });
    } else if ((hasVig || hasCmd || hasVil) && !hasAgg && !hasCun && !hasHer) {
      beltA.push(card);
    } else if ((hasAgg || hasCun || hasHer) && !hasVig && !hasCmd && !hasVil) {
      beltB.push(card);
    } else if ((hasVig || hasCmd) && (hasAgg || hasCun)) {
      beltA.push(card);
    } else if ((hasVig || hasCmd) && hasHer) {
      beltA.push(card);
      flexible.push({ card, currentBelt: 'A' });
    } else if ((hasAgg || hasCun) && hasVil) {
      beltB.push(card);
    } else if (hasVil && hasHer) {
      beltA.push(card);
    } else {
      beltB.push(card);
    }
  });

  const targetA = Math.floor(total / 2);
  const targetB = total - targetA;

  const shuffledFlexible = shuffle(flexible);

  for (const item of shuffledFlexible) {
    if (beltA.length > targetA && item.currentBelt === 'A') {
      const idx = beltA.findIndex(c => c.id === item.card.id);
      if (idx >= 0) {
        beltA.splice(idx, 1);
        beltB.push(item.card);
        item.currentBelt = 'B';
      }
    } else if (beltB.length > targetB && item.currentBelt === 'B') {
      const idx = beltB.findIndex(c => c.id === item.card.id);
      if (idx >= 0) {
        beltB.splice(idx, 1);
        beltA.push(item.card);
        item.currentBelt = 'A';
      }
    }
  }

  console.log(`${setCode}: Belt A = ${beltA.length}, Belt B = ${beltB.length}`);
  return { beltA: beltA.map(c => c.name), beltB: beltB.map(c => c.name) };
}

const assignments = {
  SOR: assignBlock0('SOR'),
  SHD: assignBlock0('SHD'),
  TWI: assignBlock0('TWI'),
  JTL: assignBlockA('JTL'),
  LOF: assignBlockA('LOF'),
  SEC: assignBlockA('SEC'),
};

// Write the file
const fileContent = `/**
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
 * Block B (Sets 7+): TBD
 *
 * To edit: Simply add or remove card names from the arrays below.
 * Run the test suite after editing to verify no duplicates and correct sizes.
 */

export const COMMON_BELT_ASSIGNMENTS = ${JSON.stringify(assignments, null, 2)};

/**
 * Get the block number for a set code
 * Block 0: Sets 1-3 (SOR, SHD, TWI)
 * Block A: Sets 4-6 (JTL, LOF, SEC)
 * Block B: Sets 7+ (TBD)
 */
export function getBlockForSet(setCode) {
  const block0Sets = ['SOR', 'SHD', 'TWI'];
  const blockASets = ['JTL', 'LOF', 'SEC'];

  if (block0Sets.includes(setCode)) return 0;
  if (blockASets.includes(setCode)) return 'A';
  return 'B'; // Future sets
}

/**
 * Get belt configuration for a block
 */
export function getBeltConfig(block) {
  if (block === 0) {
    return {
      beltASlots: 6,  // Slots 1-6
      beltBSlots: 3,  // Slots 7-9
      alternatingSlot: null,
      hyperspaceSlot: 6,  // 1-indexed
      targetBeltASize: 60,
      targetBeltBSize: 30,
    };
  } else if (block === 'A') {
    return {
      beltASlots: 4,  // Slots 1-4
      beltBSlots: 4,  // Slots 6-9
      alternatingSlot: 5,  // Slot 5 alternates
      hyperspaceSlot: 4,  // 1-indexed
      targetBeltASize: 50,
      targetBeltBSize: 50,
    };
  } else {
    // Block B - TBD, default to Block A pattern
    return {
      beltASlots: 4,
      beltBSlots: 4,
      alternatingSlot: 5,
      hyperspaceSlot: 4,
      targetBeltASize: 50,
      targetBeltBSize: 50,
    };
  }
}
`;

fs.writeFileSync('src/belts/data/commonBeltAssignments.js', fileContent);
console.log('\\nWrote belt assignments to src/belts/data/commonBeltAssignments.js');
