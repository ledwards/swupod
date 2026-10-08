# TypeScript Migration Plan

This document outlines the plan for migrating the Protect the Pod codebase to TypeScript with a robust type system.

## Table of Contents
1. [ID Field Renaming](#1-id-field-renaming)
2. [Type System Specification](#2-type-system-specification)
3. [Migration Strategy](#3-migration-strategy)
4. [tsconfig Best Practices](#4-tsconfig-best-practices)
5. [Implementation Phases](#5-implementation-phases)

---

## 1. ID Field Renaming

### Current State (Confusing)
```typescript
// Current naming - confusing because "cardId" sounds like THE id
{
  id: "42080",           // Internal API ID (unique per variant)
  cardId: "SEC-1029",    // Display format SET-NUMBER
  number: "1029"         // Collector number
}
```

### Target State (Clear)
```typescript
// New naming - self-documenting
{
  id: "42080",                    // Internal API ID (unchanged)
  collectorSetAndNumber: "SEC-1029",  // e.g., "SEC-1029" for display/export
  collectorNumber: "1029"             // e.g., "1029" - just the number portion
}
```

### Migration Steps
1. **Update `scripts/fetchCards.js`** - Change field mapping from API
2. **Update `src/data/cards.json`** - Regenerate with new field names
3. **Update all code references**:
   - `card.cardId` → `card.collectorSetAndNumber`
   - `card.number` → `card.collectorNumber`
4. **Update database columns** if any store these (check `card_generations`)
5. **Update SWUDB export** - Uses `cardId` for deck export format

### Files to Update
```
src/utils/swudbExport.js         # Primary user of cardId for export
src/utils/cardData.js            # Card data utilities
scripts/fetchCards.js            # API field mapping
scripts/postProcessCards.js      # Card processing
app/showcases/page.jsx           # Display logic
migrations/021-026               # References in migrations
```

---

## 2. Type System Specification

### 2.1 Core Card Types

```typescript
// === ENUMS & UNIONS ===

type SetCode = 'SOR' | 'SHD' | 'TWI' | 'JTL' | 'LOF' | 'SEC' | 'LAW';

type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Special';

type CardType = 'Leader' | 'Base' | 'Unit' | 'Event' | 'Upgrade';

type Aspect = 'Vigilance' | 'Command' | 'Aggression' | 'Cunning' | 'Villainy' | 'Heroism';

type Arena = 'Ground' | 'Space';

type VariantType = 'Normal' | 'Foil' | 'Hyperspace' | 'Hyperspace Foil' | 'Showcase' | 'Prestige';

// === CARD INTERFACES ===

interface BaseCard {
  // Identity
  id: string;                        // Internal API ID (unique per variant)
  collectorSetAndNumber: string;     // Display ID e.g., "SEC-1029"
  collectorNumber: string;           // Just the number e.g., "1029"

  // Core properties
  name: string;
  subtitle: string | null;
  set: SetCode;
  rarity: Rarity;
  type: CardType;

  // Gameplay
  aspects: Aspect[];
  traits: string[];
  arenas: Arena[];
  cost: number;
  power: number | null;
  hp: number | null;
  frontText: string;
  backText: string | null;
  epicAction: string | null;
  keywords: string[];

  // Metadata
  artist: string;
  unique: boolean;
  doubleSided: boolean;

  // Variant flags
  variantType: VariantType;
  isLeader: boolean;
  isBase: boolean;
  isFoil: boolean;
  isHyperspace: boolean;
  isShowcase: boolean;

  // Assets
  imageUrl: string;
  backImageUrl: string | null;

  // Pricing (optional)
  marketPrice: number | null;
  lowPrice: number | null;
}

// Card with draft instance tracking
interface DraftCard extends BaseCard {
  instanceId: string;  // Format: "{id}_{counter}" for uniqueness in draft
}

// Card in deck builder with position tracking
interface PositionedCard extends BaseCard {
  section: 'deck' | 'sideboard' | 'pool';
  x: number;
  y: number;
  visible: boolean;
}
```

### 2.2 Pack Types

```typescript
// === PACK STRUCTURES ===

interface BoosterPack {
  cards: BaseCard[];  // 16 cards: 1 leader, 1 base, 9 common, 3 UC, 1 R/L, 1 foil
}

interface DraftPack {
  cards: DraftCard[];  // 14 cards (no leader/base), each with instanceId
}

interface SealedPool {
  packs: BoosterPack[];  // 6 packs
  cards: BaseCard[];     // Flattened list of all cards
}

// Pack slot definition for generation
type PackSlot =
  | 'leader'
  | 'base'
  | 'common'
  | 'uncommon'
  | 'rare_legendary'
  | 'foil';
```

### 2.3 Belt System Types

```typescript
// === BELT INTERFACES ===

interface Belt<T extends BaseCard = BaseCard> {
  next(): T | null;
  peek(count: number): T[];
  readonly size: number;
  readonly isEmpty: boolean;
}

interface HopperBelt<T extends BaseCard = BaseCard> extends Belt<T> {
  readonly hopperSize: number;
  refillHopper(): void;
}

// Belt configuration
interface BeltConfig {
  setCode: SetCode;
  cards: BaseCard[];
  dedupWindow?: number;
}

// Specific belt types
type BeltType =
  | 'leader'
  | 'base'
  | 'commonA'
  | 'commonB'
  | 'uncommon'
  | 'rareLegendary'
  | 'foil'
  | 'showcaseLeader'
  | 'hyperspaceLeader'
  | 'hyperspaceBase'
  | 'hyperspaceCommon'
  | 'hyperspaceUncommon'
  | 'hyperspaceRareLegendary'
  | 'hyperfoil';

type BeltAssignment = 'A' | 'B';
```

### 2.4 User & Auth Types

```typescript
// === USER TYPES ===

interface User {
  id: string;  // UUID
  email: string | null;
  discordId: string | null;
  googleId: string | null;
  username: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isBetaTester: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface JWTPayload {
  id: string;
  email: string;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
  isBetaTester: boolean;
  iat: number;
  exp: number;
}

interface AuthContext {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  enrollBeta: () => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
}
```

### 2.5 Draft Types

```typescript
// === DRAFT ENUMS ===

type DraftPhase = 'lobby' | 'leader_draft' | 'pack_draft' | 'complete';

type DraftStatus = 'waiting' | 'active' | 'paused' | 'completed';

type PickStatus = 'waiting' | 'picking' | 'picked' | 'timeout';

type PassDirection = 'left' | 'right';

// === DRAFT INTERFACES ===

interface DraftState {
  phase: DraftPhase;
  packNumber: number;        // 1-3
  pickInPack: number;        // 1-14
  leaderRound: number;       // 1-2
  passDirection: PassDirection;
  timerStartedAt: Date | null;
}

interface DraftPod {
  id: string;
  shareId: string;
  hostId: string;
  setCode: SetCode;
  setName: string;
  status: DraftStatus;
  maxPlayers: number;
  currentPlayers: number;
  timerEnabled: boolean;
  timerSeconds: number;
  timed: boolean;
  draftState: DraftState;
  allPacks: DraftPack[][] | null;  // [playerIndex][packIndex]
  stateVersion: number;
  startedAt: Date | null;
  completedAt: Date | null;
  pickStartedAt: Date | null;
  paused: boolean;
  pausedAt: Date | null;
  pausedDurationSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

interface DraftPlayer {
  id: string;
  draftPodId: string;
  userId: string | null;  // null for bots
  seatNumber: number;     // 1-8
  pickStatus: PickStatus;
  currentPack: DraftCard[] | null;
  draftedCards: DraftCard[];
  draftedLeaders: DraftCard[];
  leaders: DraftCard[];
  selectedCardId: string | null;  // instanceId
  lastPickAt: Date | null;
  lastHeartbeat: Date;
  joinedAt: Date;

  // Derived
  isBot: boolean;
  displayName: string;
}

interface DraftPick {
  cardId: string;      // instanceId being picked
  playerId: string;
  timestamp: Date;
}
```

### 2.6 Pool & Deck Builder Types

```typescript
// === POOL TYPES ===

type PoolType = 'sealed' | 'draft';

interface CardPool {
  id: string;
  userId: string | null;
  shareId: string;
  setCode: SetCode;
  setName: string;
  poolType: PoolType;
  name: string;
  cards: BaseCard[];
  packs: BoosterPack[] | null;
  deckBuilderState: DeckBuilderState | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// === DECK BUILDER TYPES ===

type ViewMode = 'grid' | 'list';

type SortOption = 'aspect' | 'cost' | 'type' | 'name' | 'rarity';

interface CardPosition {
  card: BaseCard;
  section: 'deck' | 'sideboard' | 'pool';
  enabled: boolean;
  visible: boolean;
  x: number;
  y: number;
}

interface DeckBuilderState {
  poolName: string;
  leaderCard: BaseCard | null;
  baseCard: BaseCard | null;
  cardPositions: Record<string, CardPosition>;
  deckCardCount: number;
  poolCardCount: number;
  viewMode: ViewMode;
  poolSortOption: SortOption;
  deckSortOption: SortOption;
  showAspectPenalties: boolean;
}

interface Deck {
  leader: BaseCard;
  base: BaseCard;
  mainDeck: BaseCard[];     // 50 cards
  sideboard: BaseCard[];
}
```

### 2.7 Set Configuration Types

```typescript
// === SET CONFIG TYPES ===

interface CardCounts {
  leaders: { common: number; rare: number; total: number };
  bases: { common: number; rare: number; total: number };
  commons: number;
  uncommons: number;
  rares: number;
  legendaries: number;
  specials: number;
}

interface PackRules {
  rareBasesInRareSlot: boolean;
  foilSlotIsHyperspaceFoil: boolean;
  guaranteedHyperspaceCommon: boolean;
  prestigeInStandardPacks: boolean;
  specialInFoilSlot: boolean;
}

interface RarityWeights {
  foilSlot: Record<Rarity, number>;
  hyperfoil: Record<Rarity, number>;
  ucSlot3Upgraded: Record<Rarity, number>;
  hyperspaceNonFoil: Record<Rarity, number>;
}

interface UpgradeProbabilities {
  leaderToHyperspace: number;
  leaderToShowcase: number;
  baseToHyperspace: number;
  foilToHyperfoil: number;
  thirdUCToHyperspaceRL: number;
  firstUCToHyperspaceUC: number;
  secondUCToHyperspaceUC: number;
  commonToHyperspace: number;
  rareToHyperspaceRL: number;
  rareToPrestige: number;
}

interface SetConfig {
  setCode: SetCode;
  setName: string;
  setNumber: number;
  color: string;
  beta: boolean;
  cardCounts: CardCounts;
  packRules: PackRules;
  rarityWeights: RarityWeights;
  beltRatios: { rareToLegendary: number };
  upgradeProbabilities: UpgradeProbabilities;
}
```

### 2.8 Analytics & Tracking Types

```typescript
// === TRACKING TYPES ===

type SourceType = 'sealed' | 'draft';

type Treatment = 'base' | 'foil' | 'hyperspace' | 'hyperspace_foil' | 'showcase';

interface CardGeneration {
  id: string;
  cardId: string;           // Internal card ID
  setCode: SetCode;
  cardName: string;
  cardSubtitle: string | null;
  cardType: CardType;
  rarity: Rarity;
  aspects: Aspect[];
  treatment: Treatment;
  variantType: VariantType;
  isFoil: boolean;
  isHyperspace: boolean;
  isShowcase: boolean;
  packType: 'booster' | 'leader';
  slotType: PackSlot;
  sourceType: SourceType;
  sourceId: string;
  sourceShareId: string;
  packIndex: number | null;
  userId: string | null;
  generatedAt: Date;
}

interface TrackingOptions {
  packType: 'booster' | 'leader';
  sourceType: SourceType;
  sourceId: string;
  sourceShareId: string;
  slotType?: PackSlot;
  packIndex?: number;
  userId?: string;
}
```

### 2.9 API Types

```typescript
// === API RESPONSE TYPES ===

interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// Specific API responses
interface CreatePoolResponse {
  id: string;
  shareId: string;
  shareUrl: string;
  createdAt: Date;
}

interface DraftStateResponse {
  pod: DraftPod;
  player: DraftPlayer;
  players: DraftPlayer[];
  stateVersion: number;
}
```

---

## 3. Migration Strategy

### 3.1 Approach: Gradual Migration

We'll use a **gradual migration** approach rather than big-bang:

1. **Add TypeScript alongside JavaScript** - Both can coexist
2. **Migrate leaf files first** - Utils, types, pure functions
3. **Migrate core domain objects** - Cards, packs, belts
4. **Migrate components and hooks** - React code
5. **Migrate API routes last** - Most complex, most side effects

### 3.2 File Conversion Order

```
Phase 1: Foundation (Week 1)
├── src/types/              # NEW - All type definitions
│   ├── index.ts
│   ├── card.ts
│   ├── pack.ts
│   ├── belt.ts
│   ├── user.ts
│   ├── draft.ts
│   ├── pool.ts
│   └── api.ts
├── src/utils/aspectColors.ts
├── src/utils/cardSort.ts
└── src/utils/aspectCombinations.ts

Phase 2: Core Logic (Week 2)
├── src/utils/cardData.ts
├── src/utils/cardCache.ts
├── src/belts/*.ts          # All belt files
└── src/utils/boosterPack.ts

Phase 3: Draft Logic (Week 3)
├── src/utils/draftLogic.ts
├── src/utils/draftAdvance.ts
├── src/utils/botLogic.ts
└── src/utils/draftTimeout.ts

Phase 4: Hooks (Week 4)
├── src/hooks/*.ts          # All hooks
└── src/contexts/*.tsx

Phase 5: Components (Weeks 5-6)
├── src/components/Card.tsx
├── src/components/DeckBuilder.tsx
├── src/components/DeckBuilder/*.tsx
└── [remaining components]

Phase 6: API Routes (Weeks 7-8)
├── app/api/pools/*.ts
├── app/api/draft/*.ts
└── [remaining routes]
```

### 3.3 Migration Rules

1. **One file at a time** - Don't convert multiple files in one PR
2. **Tests must pass** - Run tests after each conversion
3. **No `any` types** - Use `unknown` + type guards instead
4. **Strict null checks** - Handle all nullable values explicitly
5. **Document breaking changes** - If type reveals a bug, fix it

---

## 4. tsconfig Best Practices

### 4.1 Recommended tsconfig.json

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    // === TARGET & MODULE ===
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    // === STRICT TYPE CHECKING (ALL ON) ===
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,

    // === ADDITIONAL CHECKS ===
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,

    // === MODULE INTEROP ===
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    // === OUTPUT ===
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",

    // === PATHS (for @ imports) ===
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@/types/*": ["./src/types/*"],
      "@/utils/*": ["./src/utils/*"],
      "@/components/*": ["./src/components/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/contexts/*": ["./src/contexts/*"],
      "@/lib/*": ["./lib/*"]
    },

    // === JSX (for React) ===
    "jsx": "preserve",

    // === INCREMENTAL BUILDS ===
    "incremental": true,
    "tsBuildInfoFile": "./node_modules/.cache/tsbuildinfo",

    // === SKIP DURING MIGRATION ===
    "skipLibCheck": true,
    "allowJs": true,
    "checkJs": false
  },

  "include": [
    "src/**/*",
    "app/**/*",
    "lib/**/*",
    "scripts/**/*"
  ],

  "exclude": [
    "node_modules",
    "dist",
    ".next",
    "coverage",
    "**/*.test.js",
    "**/*.test.ts"
  ]
}
```

### 4.2 Best Practices for LLM/Claude Code Compatibility

```json
{
  "compilerOptions": {
    // === LLM-FRIENDLY OPTIONS ===

    // 1. Explicit types help LLMs understand code
    "noImplicitAny": true,

    // 2. Strict null checks prevent common LLM mistakes
    "strictNullChecks": true,

    // 3. No unchecked index access forces explicit handling
    "noUncheckedIndexedAccess": true,

    // 4. Declaration files help LLMs understand module shapes
    "declaration": true,

    // 5. Source maps help with debugging LLM-generated code
    "sourceMap": true,

    // 6. Allow gradual migration (LLMs can work with mixed codebases)
    "allowJs": true,

    // 7. Verbatim module syntax makes imports predictable
    "verbatimModuleSyntax": true
  }
}
```

### 4.3 Key Principles for LLM Compatibility

1. **Explicit over implicit** - LLMs understand explicit types better
2. **Strict mode** - Catches errors LLMs might introduce
3. **No `any`** - Forces LLMs to use proper types
4. **Discriminated unions** - LLMs handle these well for state machines
5. **Type guards** - Teach LLMs to narrow types safely
6. **Branded types** - Prevent ID mix-ups (use `type UserId = string & { __brand: 'UserId' }`)

### 4.4 ESLint TypeScript Config

```javascript
// .eslintrc.js additions for TypeScript
module.exports = {
  extends: [
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json'
  },
  rules: {
    // Enforce explicit return types (helps LLMs)
    '@typescript-eslint/explicit-function-return-type': 'warn',

    // No any
    '@typescript-eslint/no-explicit-any': 'error',

    // Prefer nullish coalescing
    '@typescript-eslint/prefer-nullish-coalescing': 'warn',

    // Consistent type imports
    '@typescript-eslint/consistent-type-imports': 'error',

    // No unused vars (catches LLM mistakes)
    '@typescript-eslint/no-unused-vars': 'error'
  }
};
```

---

## 5. Implementation Phases

### Phase 0: Preparation (Before Starting)
- [ ] Install TypeScript and dependencies
- [ ] Create tsconfig.json
- [ ] Update ESLint config
- [ ] Create `src/types/` directory structure
- [ ] Rename `cardId` → `collectorSetAndNumber` and `number` → `collectorNumber`

### Phase 1: Type Definitions (Week 1)
- [ ] Create all type definition files
- [ ] Export from `src/types/index.ts`
- [ ] Add JSDoc comments to existing JS files referencing types
- [ ] Convert simple utility files (aspectColors, cardSort)

### Phase 2: Core Domain (Week 2)
- [ ] Convert belt system to TypeScript
- [ ] Convert card data utilities
- [ ] Convert pack generation
- [ ] Update tests to use types

### Phase 3: Draft System (Week 3)
- [ ] Convert draft logic
- [ ] Convert bot logic
- [ ] Convert draft timeout handling
- [ ] Add type safety to draft state management

### Phase 4: React Layer (Weeks 4-6)
- [ ] Convert hooks
- [ ] Convert contexts
- [ ] Convert components (start with leaf components)
- [ ] Update component props to use types

### Phase 5: API Layer (Weeks 7-8)
- [ ] Convert API utilities
- [ ] Convert API routes
- [ ] Add request/response type validation
- [ ] Add Zod schemas for runtime validation

### Phase 6: Cleanup
- [ ] Remove `allowJs: true` from tsconfig
- [ ] Remove all `// @ts-ignore` comments
- [ ] Enable `checkJs: true` for any remaining JS
- [ ] Final type audit

---

## Appendix A: Branded Types for IDs

To prevent mixing up different ID types, use branded types:

```typescript
// Branded type pattern
type Brand<K, T> = K & { __brand: T };

// ID types
type UserId = Brand<string, 'UserId'>;
type CardId = Brand<string, 'CardId'>;           // Internal API ID
type CollectorId = Brand<string, 'CollectorId'>; // e.g., "SEC-1029"
type ShareId = Brand<string, 'ShareId'>;
type DraftPodId = Brand<string, 'DraftPodId'>;
type InstanceId = Brand<string, 'InstanceId'>;   // e.g., "42080_1"

// Helper functions
function asUserId(id: string): UserId {
  return id as UserId;
}

function asCardId(id: string): CardId {
  return id as CardId;
}

// Now the compiler prevents mixing IDs
function getUser(id: UserId): User { ... }
function getCard(id: CardId): Card { ... }

getUser(someCardId);  // ERROR: CardId is not assignable to UserId
```

---

## Appendix B: Runtime Validation with Zod

For API boundaries, add runtime validation:

```typescript
import { z } from 'zod';

const CardSchema = z.object({
  id: z.string(),
  collectorSetAndNumber: z.string().regex(/^[A-Z]+-\d+$/),
  collectorNumber: z.string(),
  name: z.string(),
  // ... etc
});

type Card = z.infer<typeof CardSchema>;

// In API route
export async function POST(request: Request) {
  const body = await request.json();
  const result = CardSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const card: Card = result.data;
  // ...
}
```

---

## Appendix C: Type-Safe Database Queries

Consider using a type-safe query builder:

```typescript
// Option 1: Kysely (type-safe SQL builder)
import { Kysely } from 'kysely';

interface Database {
  users: UserTable;
  card_pools: CardPoolTable;
  draft_pods: DraftPodTable;
}

const db = new Kysely<Database>({ ... });

// Fully typed queries
const user = await db
  .selectFrom('users')
  .where('id', '=', userId)
  .selectAll()
  .executeTakeFirst();

// Option 2: Drizzle ORM
import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  isAdmin: boolean('is_admin').default(false),
  createdAt: timestamp('created_at').defaultNow()
});
```

---

*Document created: 2026-02-03*
*Last updated: 2026-02-03*
